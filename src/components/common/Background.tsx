'use client';

import React from 'react';

export function Background() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-black">
      {/* Deep Space Aurora Blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#2E0249] rounded-full mix-blend-screen filter blur-[100px] opacity-70 animate-blob"></div>
      <div className="absolute top-[20%] right-[-10%] w-[400px] h-[400px] bg-[#00F3FF] rounded-full mix-blend-screen filter blur-[100px] opacity-50 animate-blob animation-delay-2000"></div>
      <div className="absolute bottom-[-20%] left-[20%] w-[600px] h-[600px] bg-[#2E0249] rounded-full mix-blend-screen filter blur-[100px] opacity-70 animate-blob animation-delay-4000"></div>
      
      {/* Technical Grid Pattern */}
      <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10"></div>
    </div>
  );
}
