import { useState } from 'react';
import { motion } from 'framer-motion';
import VideoPlayer from './VideoPlayer';
import ActionButtons from './ActionButtons';
import Avatar from '../common/Avatar';
export default function VideoCard({ video, isActive }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full h-full relative bg-black">
      <VideoPlayer src={video.videoUrl} poster={video.thumbnailUrl} autoPlay={true} isActive={isActive} videoId={video._id} />
      <ActionButtons video={video} onLike={() => {}} onComment={() => {}} onShare={() => {}} onDubbing={() => {}} />
      <div className="absolute bottom-0 left-0 right-16 p-4 pt-10 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
        <div className="flex items-center gap-3 mb-2 pointer-events-auto">
          <Avatar src={video.author?.avatar} username={video.author?.username} size="md" />
          <div>
            <h3 className="font-bold text-lg hover:underline cursor-pointer">{video.author?.username}</h3>
          </div>
        </div>
        <p className="text-sm mb-2">{video.title}</p>
        <p className="text-sm text-gray-300 pointer-events-auto">
          {video.hashtags?.map(tag => <span key={tag} className="font-semibold hover:underline cursor-pointer mr-1">#{tag}</span>)}
        </p>
      </div>
    </motion.div>
  );
}
