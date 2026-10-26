export default function Spinner({ size = 24, className = '' }) {
  return (
    <span
      role="status"
      aria-label="Đang tải"
      className={`inline-block animate-disc rounded-full border-2 border-current border-r-transparent ${className}`}
      style={{ width: size, height: size, animationDuration: '0.7s' }}
    />
  );
}
