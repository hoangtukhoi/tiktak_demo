import { useParams } from 'react-router-dom';
import Header from '../../components/layout/Header';
export default function VideoDetail() {
  const { id } = useParams();
  return (
    <div className="h-screen flex flex-col">
      <Header />
      <div className="flex-1 flex pt-16 bg-black">
        <div className="flex-[2] relative">
          <div className="absolute inset-0 flex items-center justify-center text-white/50">Video Player {id}</div>
        </div>
        <div className="flex-1 glass border-l border-white/10 p-4">
          <h2 className="text-xl font-bold mb-4">Bình luận</h2>
        </div>
      </div>
    </div>
  );
}
