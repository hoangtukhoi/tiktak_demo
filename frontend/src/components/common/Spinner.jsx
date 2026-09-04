export default function Spinner({ size = 'md' }) {
  const sizeClasses = { sm: 'h-4 w-4', md: 'h-8 w-8', lg: 'h-12 w-12' };
  return (
    <div className={`animate-spin rounded-full border-2 border-white/20 border-t-brand-from ${sizeClasses[size]}`} />
  );
}
