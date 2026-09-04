import { useSearchParams } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Sidebar from '../../components/layout/Sidebar';
export default function Search() {
  const [searchParams] = useSearchParams();
  const q = searchParams.get('q');
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex flex-1 pt-16">
        <Sidebar />
        <main className="flex-1 lg:ml-64 p-8">
          <h1 className="text-2xl font-bold mb-6">Kết quả cho: {q}</h1>
        </main>
      </div>
    </div>
  );
}
