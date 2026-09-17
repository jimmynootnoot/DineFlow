import unittest
from mine_recommendations import mine


class MiningTests(unittest.TestCase):
    def test_singletons_are_in_denominator_and_duplicates_are_binary(self):
        baskets, _, rules = mine([["A", "A", "B"], ["A", "B"], ["A"], ["C"]], 0.1, 0.1)
        rule = next(r for r in rules if r["antecedent"] == ["A"] and r["consequent"] == ["B"])
        self.assertEqual(len(baskets), 4)
        self.assertAlmostEqual(rule["support"], 0.5)
        self.assertAlmostEqual(rule["confidence"], 2 / 3)
        self.assertAlmostEqual(rule["lift"], 4 / 3)

    def test_independent_and_negative_rules_are_removed(self):
        self.assertEqual(mine([["A", "B"], ["A"], ["B"], ["C"]], 0.1, 0.1)[2], [])

    def test_combinations_are_retained(self):
        rules = mine([["A", "B", "C"], ["A", "B", "C"], ["D"]], 0.1, 0.1)[2]
        self.assertTrue(any(len(r["antecedent"]) == 2 for r in rules))
        self.assertTrue(any(len(r["consequent"]) == 2 for r in rules))

    def test_no_rules_and_invalid_threshold(self):
        self.assertEqual(mine([["A"], ["B"]])[2], [])
        self.assertEqual(mine([]), ([], [], []))
        with self.assertRaises(ValueError):
            mine([["A"]], 0)


if __name__ == "__main__":
    unittest.main()
