export default function Button({ children, variant = 'primary', size = 'md', loading = false, className = '', ...props }) {
  const base = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-brand-from hover:bg-brand-to text-white',
    ghost: 'bg-transparent hover:bg-white/10 text-white',
    danger: 'bg-red-500 hover:bg-red-600 text-white'
  };
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2 text-base', lg: 'px-6 py-3 text-lg' };
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} disabled={loading || props.disabled} {...props}>
      {loading ? <span className="mr-2 animate-spin rounded-full h-4 w-4 border-2 border-white/20 border-t-white" /> : null}
      {children}
    </button>
  );
}
