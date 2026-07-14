const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const customerSchema = new mongoose.Schema({
  accountNumber: {
    type: String,
    unique: true,
    sparse: true, // allows null during pre-save then gets set
  },
  firstName: { type: String, required: true, trim: true },
  lastName:  { type: String, required: true, trim: true },
  address:   { type: String, required: true, trim: true },
  barangay:  { type: String, required: true, trim: true },
  contactNumber: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  meterNumber: { type: String, required: true, unique: true, trim: true },
  connectionType: {
    type: String,
    enum: ['Residential', 'Commercial', 'Industrial'],
    default: 'Residential',
  },
  status: {
    type: String,
    enum: ['Active', 'Disconnected', 'Pending'],
    default: 'Active',
  },
  previousReading: { type: Number, default: 0 },
  currentReading:  { type: Number, default: 0 },
  outstandingBalance: { type: Number, default: 0 },
}, { timestamps: true });

customerSchema.plugin(mongoosePaginate);


customerSchema.pre('validate', async function (next) {
  if (!this.accountNumber) {
    const lastCustomer = await mongoose.model('Customer')
      .findOne({ accountNumber: { $exists: true, $ne: null } })
      .sort({ accountNumber: -1 });

    let nextNumber = 1;
    if (lastCustomer && lastCustomer.accountNumber) {
      const lastNum = parseInt(lastCustomer.accountNumber.split('-')[1], 10);
      if (!isNaN(lastNum)) nextNumber = lastNum + 1;
    }
    this.accountNumber = `WB-${String(nextNumber).padStart(5, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Customer', customerSchema);