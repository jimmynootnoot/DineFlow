# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Customers and diners browse the menu, ask menu questions, build dine-in or takeout orders, pay in sandbox mode, and track their own orders.
- Restaurant service crew and cashiers accept orders, handle billing, and resolve requests requiring human approval.
- Kitchen personnel receive electronic tickets and update preparation status.
- Owners, managers, and administrators maintain the menu and review live sales and item performance.

## Product Purpose

DineFlow AI digitizes the restaurant cycle from menu discovery through kitchen fulfillment and billing. It reduces ordering errors, centralizes restaurant records, gives customers grounded menu guidance, and restores context-aware upselling through transaction-derived recommendations.

## Positioning

The product combines a role-based restaurant operating system with a conversational assistant grounded only in approved restaurant information and recommendations derived from actual order combinations.

## Operating Context

- Philippine small and medium-sized restaurant service, including busy dine-in and takeout periods.
- Dine-in sessions may be associated with a table; takeout orders have no table assignment.
- Orders move through received, preparing, ready, completed, or cancelled states.
- Customer questions may cover dishes, ingredients, allergens, spice, portions, budget, group size, availability, store operations, payment methods, and order status.

## Capabilities and Constraints

- Supabase PostgreSQL, Authentication, Row Level Security, and real-time subscriptions are the application data authority.
- The menu supports categories, search, filtering, details, pricing, availability, photos, ingredients, allergen notes, spice level, portion guidance, and estimated preparation time.
- Cart and checkout support quantity, remarks, dine-in table assignment, takeout, bill computation, order summary, and Maya sandbox payment.
- Kitchen, tracking, order history, menu management, sales reports, item performance, and AI sales summaries are role-aware.
- The ordering assistant is grounded on menu and approved restaurant information. It guides but cannot place, alter, cancel, discount, or medically evaluate an order.
- Requests for discounts, special preparation, cancellation, disputes, or unlisted decisions are escalated to staff.
- Recommendation rules use historical order combinations. Simulated validation records must be labeled when used before sufficient live history exists.
- Online operation is required. Payroll, staff scheduling, supplier procurement, and ingredient-level inventory deduction are out of scope.

## Brand Commitments

- Product name: DineFlow AI / DineFlow OS.
- Preserve the incumbent warm, restrained restaurant interface and its existing navigation/component language while extending functionality.

## Evidence on Hand

- Requirements authority: `C:/Users/jimmy/Downloads/DineFlow_AI_SE2_Documentation (1).pdf` (the current 29-page SE2 paper).
- Existing role-based application shell and restaurant workflows in `src/App.js`.
- No production restaurant claims, live recommendation training set, LLM credentials, or real payment credentials were supplied; generated seed transactions and sandbox behavior must remain explicit.

## Product Principles

- Operational records and billing remain deterministic core-system functions.
- AI answers from approved restaurant data and escalates uncertainty or business decisions.
- Every order state is centralized, traceable, and visible to the appropriate role.
- Customer guidance should reduce hesitation without obscuring price, availability, or control.
- Recommendations must be explainable by observed order pairings, not arbitrary promotion.
