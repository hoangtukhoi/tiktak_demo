/**
 * Seed script — tạo tài khoản admin
 * Chạy: node src/scripts/createAdmin.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function createAdmin() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: 'tiktak' });
  console.log('MongoDB connected');

  const email    = process.env.ADMIN_EMAIL    || 'admin@tiktak.com';
  const password = process.env.ADMIN_PASSWORD || 'Admin@123456';
  const username = process.env.ADMIN_USERNAME || 'admin';

  const existing = await User.findOne({ email });
  if (existing) {
    // Nếu đã tồn tại thì chỉ nâng role lên admin
    await User.updateOne({ email }, { $set: { role: 'admin', isVerified: true } });
    console.log(`✅ User "${email}" đã được set role = admin`);
  } else {
    await User.create({ username, email, password, role: 'admin', isVerified: true });
    console.log(`✅ Tạo admin thành công:`);
    console.log(`   Email:    ${email}`);
    console.log(`   Password: ${password}`);
    console.log(`   Username: ${username}`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

createAdmin().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
