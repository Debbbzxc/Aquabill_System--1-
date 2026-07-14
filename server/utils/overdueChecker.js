const Bill = require('../models/Bill');
const Customer = require('../models/Customer');
const notifyAdmin = require('../notifyAdmin');

async function checkAndApplyPenalties() {
  try {
    const now = new Date();
    // Find bills that are past due date and are still Unpaid or Partial
    const overdueBills = await Bill.find({
      status: { $in: ['Unpaid', 'Partial'] },
      dueDate: { $lt: now }
    });

    if (overdueBills.length === 0) return;

    for (const bill of overdueBills) {
      const penalty = bill.totalAmount * 0.02;
      bill.penaltyAmount = (bill.penaltyAmount || 0) + penalty;
      bill.totalAmount += penalty;
      bill.balance = bill.totalAmount - bill.amountPaid;
      bill.status = 'Overdue';
      await bill.save();

      // Update customer outstanding balance by summing up remaining unpaid/partial bills
      const customer = await Customer.findById(bill.customer);
      if (customer) {
        const unpaidBills = await Bill.find({
          customer: customer._id,
          status: { $in: ['Unpaid', 'Partial', 'Overdue'] }
        });
        customer.outstandingBalance = unpaidBills.reduce((sum, b) => sum + (b.balance || 0), 0);
        await customer.save();
      }
    }

    notifyAdmin();
  } catch (err) {
    console.error('Error applying overdue penalties:', err.message);
  }
}

module.exports = checkAndApplyPenalties;
