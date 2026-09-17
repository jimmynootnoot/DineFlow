"""Offline Apriori batch and reproducible Appendix A export (no customer data)."""
import argparse
import csv
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests
from mlxtend.frequent_patterns import apriori, association_rules
from mlxtend.preprocessing import TransactionEncoder


def mine(transactions, min_support=0.05, min_confidence=0.25, max_length=3):
    if not 0 < min_support <= 1 or not 0 < min_confidence <= 1:
        raise ValueError("Support and confidence must be greater than 0 and at most 1.")
    if not 2 <= max_length <= 5:
        raise ValueError("Maximum itemset length must be between 2 and 5.")
    # Binary presence per order, INCLUDING single-item orders in the denominator.
    baskets = [sorted(set(str(item) for item in basket if item)) for basket in transactions]
    if not baskets:
        return [], [], []
    if not any(baskets):
        return baskets, [], []
    encoder = TransactionEncoder()
    matrix = pd.DataFrame(encoder.fit(baskets).transform(baskets), columns=encoder.columns_)
    frequent = apriori(matrix, min_support=min_support, use_colnames=True, max_len=max_length)
    itemsets = [{"items": sorted(row.itemsets), "support": float(row.support)} for row in frequent.itertuples()]
    if frequent.empty or not any(len(items) > 1 for items in frequent.itemsets):
        return baskets, itemsets, []
    rules = association_rules(frequent, metric="confidence", min_threshold=min_confidence)
    output = []
    for rule in rules.to_dict("records"):
        if rule["lift"] <= 1.0:
            continue
        output.append({
            "antecedent": sorted(rule["antecedents"]), "consequent": sorted(rule["consequents"]),
            "support": float(rule["support"]), "confidence": float(rule["confidence"]), "lift": float(rule["lift"]),
        })
    output.sort(key=lambda r: (-r["lift"], -r["confidence"], -r["support"], r["antecedent"], r["consequent"]))
    return baskets, itemsets, output


def read_all(session, url, headers, table, params):
    rows, offset = [], 0
    while True:
        response = session.get(f"{url}/rest/v1/{table}", params={**params, "offset": offset, "limit": 500}, headers=headers, timeout=60)
        response.raise_for_status()
        page = response.json()
        rows.extend(page)
        if not page:
            return rows
        offset += len(page)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, help="Simulated JSON baskets; never inserted as sales")
    parser.add_argument("--publish", action="store_true", help="Atomically publish a complete batch")
    parser.add_argument("--output", type=Path, default=Path("docs/appendices/generated"))
    parser.add_argument("--min-support", type=float, default=0.05)
    parser.add_argument("--min-confidence", type=float, default=0.25)
    parser.add_argument("--max-length", type=int, default=3)
    parser.add_argument("--min-transactions", type=int, default=5)
    args = parser.parse_args()
    source = "simulated" if args.input else "historical"
    url, key = os.environ.get("SUPABASE_URL", "").rstrip("/"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    session, menu = requests.Session(), []
    if args.publish or not args.input:
        if not url or not key:
            parser.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for database access.")
        menu = read_all(session, url, headers, "menu_items", {"select": "id,name", "order": "id.asc"})
    if args.input:
        transactions = json.loads(args.input.read_text(encoding="utf-8"))
        if not isinstance(transactions, list) or any(not isinstance(b, list) or any(not isinstance(x, str) for x in b) for b in transactions):
            parser.error("Input must be an array of arrays of menu item names.")
        if args.publish:
            ids = {item["name"]: item["id"] for item in menu}
            missing = sorted({name for basket in transactions for name in basket} - ids.keys())
            if missing:
                parser.error(f"Simulation names are not on the current menu: {', '.join(missing)}")
            transactions = [[ids[name] for name in basket] for basket in transactions]
    else:
        cutoff = datetime.now(timezone.utc).isoformat()
        orders = read_all(session, url, headers, "orders", {
            "select": "id,order_items(menu_item_id)", "status": "eq.completed", "payment_status": "eq.paid",
            "created_at": f"lte.{cutoff}", "order": "id.asc",
        })
        transactions = [[item["menu_item_id"] for item in order["order_items"] if item["menu_item_id"]] for order in orders]
    baskets, itemsets, rules = mine(transactions, args.min_support, args.min_confidence, args.max_length)
    if len(baskets) < args.min_transactions:
        raise SystemExit(f"Only {len(baskets)} eligible transactions; need {args.min_transactions}. Existing rules were not changed.")
    names = {item["id"]: item["name"] for item in menu}
    fingerprint = hashlib.sha256(json.dumps(sorted(baskets), separators=(",", ":")).encode()).hexdigest()
    report = {
        "algorithm": "mlxtend.apriori", "source": source, "generated_at": datetime.now(timezone.utc).isoformat(),
        "transaction_count": len(baskets), "dataset_sha256": fingerprint,
        "min_support": args.min_support, "min_confidence": args.min_confidence, "min_lift_exclusive": 1,
        "max_length": args.max_length, "frequent_itemset_count": len(itemsets), "rule_count": len(rules),
        "rules": [{**r, "antecedent_names": [names.get(x, x) for x in r["antecedent"]],
                   "consequent_names": [names.get(x, x) for x in r["consequent"]]} for r in rules],
        "frequent_itemsets": itemsets,
    }
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "appendix-a-rules.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    with (args.output / "appendix-a-rules.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream)
        writer.writerow(["Antecedent", "Consequent", "Support", "Confidence", "Lift", "Source", "Transactions", "Dataset SHA256"])
        for rule in report["rules"]:
            writer.writerow([" + ".join(rule["antecedent_names"]), " + ".join(rule["consequent_names"]),
                             rule["support"], rule["confidence"], rule["lift"], source, len(baskets), fingerprint])
    if args.publish:
        response = session.post(f"{url}/rest/v1/rpc/publish_recommendation_batch", headers=headers,
                                json={"p_report": report}, timeout=120)
        response.raise_for_status()
        print(f"Published batch {response.json()}.")
    print(f"{source}: {len(baskets)} baskets, {len(itemsets)} frequent itemsets, {len(rules)} positive rules. Exported to {args.output}.")


if __name__ == "__main__":
    main()
