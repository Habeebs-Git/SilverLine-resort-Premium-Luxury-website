# Razorpay Integration Walkthrough

The Razorpay TEST MODE integration is complete. The mock payment logic has been entirely replaced with a production-ready order and verification flow, and the frontend has been orchestrated to use the Razorpay Checkout widget.

## Exact Payment Flow

1. **Client** calls `POST /api/orders` with reservation details.
2. **Server** validates input, re-verifies availability, and prices the room entirely on the backend to prevent tampering.
3. **Server** invokes the Razorpay SDK to create an order (`rzp_order_id`) and returns it to the client along with the key ID.
4. **Client** loads `checkout.js` (dynamically injected if missing) and launches the Razorpay widget for the user.
5. **Client** handles the test payment within the widget. On success, Razorpay provides an order ID, a payment ID, and a signature.
6. **Client** sends these three values along with the original details to `POST /api/reservations`.
7. **Server** uses HMAC-SHA256 to verify the Razorpay signature against the `PAYMENT_RAZORPAY_KEY_SECRET`.
8. **Server** issues the `create_reservation_atomic` RPC to Supabase, finalizing the double-booking check and committing the reservation and payment to PostgreSQL atomically.

## Files Changed

- **`package.json`**: Added `razorpay` as a dependency.
- **`api/_lib/payment.js`** [NEW]: Implemented the Razorpay SDK wrapper and `verifySignature` HMAC-SHA256 utility.
- **`api/_lib/payment.test.js`** [NEW]: Added unit tests to validate the HMAC-SHA256 signature verification behavior.
- **`api/orders.js`** [NEW]: Added a serverless endpoint to generate secure Razorpay orders.
- **`api/reservations.js`**: Refactored to enforce Razorpay signature verification and process real Razorpay identifiers via the existing RPC.
- **`js/booking-engine.js`**: Updated Step 4 (`submitReservation`) to fetch the order, initialize the Razorpay SDK, and post the verification payload.

## Test Results

- **Payment Unit Tests**: 3/3 passed (validating HMAC acceptance, rejection, and error handling).
- **Availability Unit Tests**: 29/29 passed (unaffected by payment changes).
- **Integration Tests**: 75/75 passed (the DB layer and RPC continue to operate successfully as they already expected order IDs and paise amounts).

## Environment Variables Required

The following environment variables MUST be configured in Vercel for the backend to function:
- `PAYMENT_PROVIDER` (e.g., set to `razorpay`)
- `PAYMENT_RAZORPAY_KEY_ID` (e.g., `rzp_test_...`)
- `PAYMENT_RAZORPAY_KEY_SECRET` (the secret from the Razorpay dashboard)

## Remaining Issues

There are no remaining implementation issues. The booking engine is now wired directly to Razorpay's test environment. 

> [!TIP]
> Before going live, you must replace the test keys with live keys in Vercel and confirm that the webhook endpoints (if you decide to implement asynchronous refund tracking in the future) are appropriately configured. For the current synchronous flow, test mode is 100% complete.
