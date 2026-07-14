const Bill = require('../models/Bill');
const Customer = require('../models/Customer');

async function checkAndApplyPenalties() {
  try {
    const now = new Date();
    // Find bills that are past due date and are still Unpaid or Partial
    const overdueBills = await Bill.find({
      status: { $in: ['Unpaid', 'Partial'] },
      dueDate: { $lt: now }
    });

    for (const bill of overdueBills) {
      const penalty = bill.totalAmount * 0.02;
      bill.penaltyAmount = (bill.penaltyAmount || 0) + penalty;
      bill.totalAmount += penalty;
      bill.balance = bill.totalAmount - bill.amountPaid;
      bill.status = 'Overdue';
      await bill.save();

      // Update customer outstanding balance
      const customer = await Customer.findById(bill.customer);
      if (customer) {
        customer.outstandingBalance += penalty;
        await customer.save();
      }
    }
  } catch (err) {
    console.error('Error applying overdue penalties:', err.message);
  }
}

module.exports = checkAndApplyPenalties;
