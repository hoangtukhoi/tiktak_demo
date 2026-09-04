const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String, required: true, unique: true,
      trim: true, minlength: 3, maxlength: 30,
      match: [/^[a-zA-Z0-9_]+$/, 'Username chỉ được chứa chữ, số và dấu gạch dưới'],
    },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, minlength: 6, select: false },
    googleId: { type: String, sparse: true },
    avatarUrl: { type: String, default: null },
    bio: { type: String, maxlength: 150, default: '' },
    isVerified: { type: Boolean, default: false },
    role: { type: String, enum: ['user', 'admin', 'moderator'], default: 'user' },
    followerCount: { type: Number, default: 0 },
    followingCount: { type: Number, default: 0 },
    videoCount: { type: Number, default: 0 },
    bannedAt: { type: Date, default: null },
    banReason: { type: String, default: null },
    lastLoginAt: { type: Date, default: null },
    refreshTokens: [{ type: String, select: false }], // lưu refresh tokens hợp lệ
  },
  { timestamps: true }
);

// Hash password trước khi save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// So sánh password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Loại bỏ các field nhạy cảm khi convert sang JSON
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshTokens;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
