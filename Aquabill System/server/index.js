require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/external', require('./routes/external'));
// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'aquabill_secret_change_me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,   // set true if HTTPS
    httpOnly: true,
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
  },
}));

app.use(express.static(path.join(__dirname, '../client/public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.jsx')) {
      res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
    }
  },
}));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB');
    // Seed default admin user if none exists
    const User = require('./models/User');
    const count = await User.countDocuments();
    if (count === 0) {
      const defaultUsername = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
      const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
      await User.create({ username: defaultUsername, password: defaultPassword, fullName: 'Administrator', role: 'admin' });
      console.log(`👤 Default admin account created (username: ${defaultUsername}). Set DEFAULT_ADMIN_USERNAME / DEFAULT_ADMIN_PASSWORD in .env to customize, and change the password after first login.`);
    }
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

// API Routes
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/bills',     require('./routes/bills'));
app.use('/api/payments',  require('./routes/payments'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/portal',    require('./routes/portal'));

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/public/index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚰 AquaBill running at http://localhost:${PORT}`);
});
