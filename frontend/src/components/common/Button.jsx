import Spinner from './Spinner';

export default function Button({ variant = 'primary', loading = false, className = '', children, ...props }) {
  return (
    <button className={`${variant === 'ghost' ? 'btn-ghost' : 'btn'} ${className}`} disabled={loading || props.disabled} {...props}>
      {loading && <Spinner size={16} />}
      {children}
    </button>
  );
}
