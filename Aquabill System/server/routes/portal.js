const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');
const Bill = require('../models/Bill');
const Payment = require('../models/Payment');

// PUBLIC — customer self-service lookup.
// No admin session required, but we still ask for two pieces of info
// (account number + last name) so a customer can't browse other accounts
// just by guessing a sequential account number.
router.get('/lookup', async (req, res) => {
  try {
    const accountNumber = (req.query.account || '').trim();
    const lastName = (req.query.lastName || '').trim();

    if (!accountNumber || !lastName) {
      return res.status(400).json({ success: false, message: 'Account number and last name are required.' });
    }

    const customer = await Customer.findOne({
      accountNumber: { $regex: `^${accountNumber}$`, $options: 'i' },
      lastName: { $regex: `^${lastName}$`, $options: 'i' },
    });

    if (!customer) {
      return res.status(404).json({ success: false, message: 'No account found matching that account number and last name.' });
    }

    const bills = await Bill.find({ customer: customer._id }).sort({ createdAt: -1 }).limit(24);
    const payments = await Payment.find({ customer: customer._id })
      .sort({ paymentDate: -1 })
      .limit(24)
      .populate('bill', 'billNumber billingPeriod');

    res.json({
      success: true,
      data: {
        customer: {
          firstName: customer.firstName,
          lastName: customer.lastName,
          accountNumber: customer.accountNumber,
          meterNumber: customer.meterNumber,
          address: customer.address,
          barangay: customer.barangay,
          connectionType: customer.connectionType,
          status: customer.status,
          outstandingBalance: customer.outstandingBalance,
        },
        bills,
        payments,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUBLIC — pay a bill online via e-wallet (GCash / PayMaya).
// This is a simulated payment gateway: no real money moves and no external
// API keys are required. It mimics the flow of a real integration (PayMongo /
// Xendit / direct GCash & Maya merchant APIs all work the same way — you
// create a payment intent, the customer approves it in-app, the gateway
// posts back a transaction reference, and you mark the bill as paid). When
// you're ready to go live, swap the block marked "SIMULATED GATEWAY" below
// for a real API call and verify its webhook/callback before marking the
// payment Completed.
router.post('/pay', async (req, res) => {
  try {
    const accountNumber = (req.body.account || '').trim();
    const lastName = (req.body.lastName || '').trim();
    const billId = (req.body.billId || '').trim();
    const paymentMethod = (req.body.paymentMethod || '').trim(); // 'GCash' | 'PayMaya'
    const payerMobile = (req.body.payerMobile || '').trim();
    let amount = parseFloat(req.body.amount);

    if (!accountNumber || !lastName || !billId) {
      return res.status(400).json({ success: false, message: 'Missing account, last name, or bill.' });
    }
    if (!['GCash', 'PayMaya'].includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: 'Unsupported payment method.' });
    }
    if (!/^09\d{9}$/.test(payerMobile)) {
      return res.status(400).json({ success: false, message: 'Enter a valid 11-digit mobile number (e.g. 09XXXXXXXXX).' });
    }

    // Re-verify identity the same way /lookup does, so a bill ID alone can't be used to pay on someone else's behalf.
    const customer = await Customer.findOne({
      accountNumber: { $regex: `^${accountNumber}$`, $options: 'i' },
      lastName: { $regex: `^${lastName}$`, $options: 'i' },
    });
    if (!customer) {
      return res.status(404).json({ success: false, message: 'No account found matching that account number and last name.' });
    }

    const bill = await Bill.findOne({ _id: billId, customer: customer._id });
    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found on this account.' });
    if (bill.status === 'Paid') return res.status(400).json({ success: false, message: 'This bill is already paid.' });

    if (isNaN(amount) || amount <= 0) amount = bill.balance;
    amount = Math.min(amount, bill.balance);

    // ── SIMULATED GATEWAY ──
    // A real integration would create a checkout/payment-intent here, redirect
    // the customer to GCash/Maya to approve, then confirm via webhook. We
    // simulate an instant successful approval and let the Payment model
    // auto-generate the transaction reference number.
    const actualPaid = amount;

    const payment = new Payment({
      customer: customer._id,
      bill: bill._id,
      amountPaid: actualPaid,
      change: 0,
      paymentMode: paymentMethod,
      channel: 'Online',
      payerMobile,
      status: 'Completed',
      collectedBy: 'Customer Portal (Online)',
      remarks: 'Paid online by customer',
    });
    await payment.save();

    bill.amountPaid += actualPaid;
    bill.balance     = Math.max(0, bill.totalAmount - bill.amountPaid);
    bill.status      = bill.balance <= 0 ? 'Paid' : 'Partial';
    if (bill.status === 'Paid') bill.paidDate = new Date();
    await bill.save();

    customer.outstandingBalance = Math.max(0, customer.outstandingBalance - actualPaid);
    await customer.save();

    await payment.populate([
      { path: 'customer', select: 'firstName lastName accountNumber' },
      { path: 'bill', select: 'billNumber totalAmount billingPeriod' },
    ]);

    res.status(201).json({ success: true, data: payment, message: 'Payment successful.' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
