export default function Avatar({ src, username = 'User', size = 'md', className = '' }) {
  const sizeClasses = { sm: 'h-8 w-8 text-sm', md: 'h-10 w-10 text-base', lg: 'h-16 w-16 text-xl', xl: 'h-24 w-24 text-3xl' };
  return (
    <div className={`rounded-full overflow-hidden flex items-center justify-center shrink-0 ${sizeClasses[size]} ${className} ${!src ? 'gradient-bg font-bold' : ''}`}>
      {src ? <img src={src} alt={username} className="w-full h-full object-cover" /> : username.charAt(0).toUpperCase()}
    </div>
  );
}
