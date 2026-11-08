// Biến môi trường cố định cho mọi bộ test — không phụ thuộc file .env của máy
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';
process.env.JWT_EXPIRES_IN = '1h';
process.env.INTERNAL_KEY = 'test_internal_key_123';
process.env.ANALYTICS_TZ = 'Asia/Ho_Chi_Minh';
process.env.USERNAME_CHANGE_DAYS = '30';
// Không có AI service khi chạy test: trỏ tới cổng đóng để lỗi kết nối trả về ngay
process.env.AI_SERVICE_URL = 'http://127.0.0.1:9';
