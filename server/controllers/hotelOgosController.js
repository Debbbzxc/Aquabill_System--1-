const Customer = require('../models/Customer');
const Bill = require('../models/Bill');
const Payment = require('../models/Payment');
const notifyAdmin = require('../notifyAdmin');

/**
 * Seeds the "Hotel Ogos" customer if they do not exist.
 */
async function seedHotelOgosCustomer() {
  try {
    let customer = await Customer.findOne({ firstName: 'Hotel', lastName: 'Ogos' });
    if (!customer) {
      customer = new Customer({
        firstName: 'Hotel',
        lastName: 'Ogos',
        meterNumber: 'M-HOTEL-OGOS',
        connectionType: 'Commercial',
        barangay: 'Commercial',
        address: 'Hotel Ogos - Main Highway',
        email: 'billing@hotelogos.com',
        contactNumber: '09887776655',
        status: 'Active',
        outstandingBalance: 0,
      });
      await customer.save();
      console.log('👤 Seeded "Hotel Ogos" customer record.');
    }
    return customer;
  } catch (err) {
    console.error('❌ Error seeding Hotel Ogos customer:', err.message);
  }
}

/**
 * GET /api/hotel-ogos/customer
 * Returns the Hotel Ogos customer record.
 */
async function getHotelOgosCustomer(req, res) {
  try {
    const customer = await Customer.findOne({ firstName: 'Hotel', lastName: 'Ogos' });
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Hotel Ogos customer record not found.' });
    }

    // Recalculate outstandingBalance dynamically
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
}

/**
 * GET /api/hotel-ogos/bills
 * Returns bills belonging to Hotel Ogos.
 */
async function getHotelOgosBills(req, res) {
  try {
    const customer = await Customer.findOne({ firstName: 'Hotel', lastName: 'Ogos' });
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Hotel Ogos customer record not found.' });
    }

    const query = { customer: customer._id };
    if (req.query.status) {
      query.status = req.query.status;
    }

    const bills = await Bill.find(query).sort({ createdAt: -1 });
    res.json({ success: true, data: bills });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * POST /api/hotel-ogos/pay
 * Pays an outstanding bill for Hotel Ogos.
 */
async function payHotelOgosBill(req, res) {
  try {
    const { billId, amountPaid, referenceNumber } = req.body;
    if (!billId || !amountPaid || isNaN(amountPaid) || parseFloat(amountPaid) <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid or missing billId or amountPaid.' });
    }

    const customer = await Customer.findOne({ firstName: 'Hotel', lastName: 'Ogos' });
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Hotel Ogos customer record not found.' });
    }

    const bill = await Bill.findOne({ _id: billId, customer: customer._id });
    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found or does not belong to Hotel Ogos.' });
    }

    if (bill.status === 'Paid') {
      return res.status(400).json({ success: false, message: 'This bill is already paid.' });
    }

    const actualPaid = Math.min(parseFloat(amountPaid), bill.balance);

    const payment = new Payment({
      customer: customer._id,
      bill: bill._id,
      amountPaid: actualPaid,
      change: 0,
      paymentMode: 'Bank Transfer',
      channel: 'Online',
      referenceNumber: referenceNumber || undefined, // Pre-save will auto-generate if blank
      status: 'Completed',
      collectedBy: 'Hotel Ogos Integration',
      remarks: 'Paid directly via Hotel Ogos Reservation System integration',
    });

    await payment.save();

    // Update Bill
    bill.amountPaid += actualPaid;
    bill.balance = Math.max(0, bill.totalAmount - bill.amountPaid);
    bill.status = bill.balance <= 0 ? 'Paid' : 'Partial';
    if (bill.status === 'Paid') {
      bill.paidDate = new Date();
    }
    await bill.save();

    // Update Customer outstanding balance by summing up remaining unpaid/partial bills
    const unpaidBills = await Bill.find({
      customer: customer._id,
      status: { $in: ['Unpaid', 'Partial', 'Overdue'] }
    });
    customer.outstandingBalance = unpaidBills.reduce((sum, b) => sum + (b.balance || 0), 0);
    await customer.save();

    // Trigger Admin notification for central system dashboard
    await notifyAdmin();

    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully.',
      data: payment,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  seedHotelOgosCustomer,
  getHotelOgosCustomer,
  getHotelOgosBills,
  payHotelOgosBill,
};
