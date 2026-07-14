const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');
const Bill = require('../models/Bill');
const Payment = require('../models/Payment');
const { requireAuth } = require('../middleware/auth');
const notifyAdmin = require('../notifyAdmin');
router.use(requireAuth);

// GET all customers (with pagination & search)
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', status } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName:  { $regex: search, $options: 'i' } },
        { accountNumber: { $regex: search, $options: 'i' } },
        { meterNumber:   { $regex: search, $options: 'i' } },
        { address:       { $regex: search, $options: 'i' } },
      ];
    }
    if (status) query.status = status;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
    };

    const result = await Customer.paginate(query, options);
    
    // Self-healing: Recalculate outstandingBalance for all returned customers
    for (let i = 0; i < result.docs.length; i++) {
      const c = result.docs[i];
      const unpaidBills = await Bill.find({
        customer: c._id,
        status: { $in: ['Unpaid', 'Partial', 'Overdue'] }
      });
      const totalBalance = unpaidBills.reduce((sum, b) => sum + (b.balance || 0), 0);
      if (c.outstandingBalance !== totalBalance) {
        c.outstandingBalance = totalBalance;
        await Customer.findByIdAndUpdate(c._id, { outstandingBalance: totalBalance });
      }
    }

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET single customer
router.get('/:id', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    
    // Recalculate outstandingBalance
    const unpaidBills = await Bill.find({
      customer: customer._id,
      status: { $in: ['Unpaid', 'Partial', 'Overdue'] }
    });
    const totalBalance = unpaidBills.reduce((sum, b) => sum + (b.balance || 0), 0);
    if (customer.outstandingBalance !== totalBalance) {
      customer.outstandingBalance = totalBalance;
      await Customer.findByIdAndUpdate(customer._id, { outstandingBalance: totalBalance });
    }

    res.json({ success: true, data: customer });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST create customer
router.post('/', async (req, res) => {
  try {
    const customer = new Customer(req.body);
    await customer.save();
    notifyAdmin();
    res.status(201).json({ success: true, data: customer, message: 'Customer created successfully' });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ success: false, message: 'Meter number or account number already exists' });
    }
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT update customer
router.put('/:id', async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    notifyAdmin();
    res.json({ success: true, data: customer, message: 'Customer updated successfully' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE customer
router.delete('/:id', async (req, res) => {
  try {
    const customerId = req.params.id;
    const customer = await Customer.findById(customerId);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    // Cascade delete associated bills and payments
    await Bill.deleteMany({ customer: customerId });
    await Payment.deleteMany({ customer: customerId });

    await Customer.findByIdAndDelete(customerId);
    notifyAdmin();
    res.json({ success: true, message: 'Customer and all associated bills and payments deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
