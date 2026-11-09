import Spinner from './Spinner';

const VARIANT = { primary: 'btn-primary', secondary: 'btn-secondary', outline: 'btn-outline', ghost: 'btn-ghost' };

export default function Button({ variant = 'primary', size, loading = false, className = '', children, ...props }) {
  return (
    <button className={`${VARIANT[variant]} ${size === 'sm' ? 'btn-sm' : ''} ${className}`} disabled={loading || props.disabled} {...props}>
      {loading && <Spinner size={14} />}
      {children}
    </button>
  );
}
