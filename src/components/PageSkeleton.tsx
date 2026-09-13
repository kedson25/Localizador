import React from 'react';

export function PageSkeleton({ variant, className }: { variant?: string, className?: string }) {
  return (
    <div className={`animate-pulse space-y-4 ${className || ''}`}>
      <div className="h-10 bg-gray-200 rounded-lg w-1/3"></div>
      <div className="h-32 bg-gray-200 rounded-lg w-full"></div>
      <div className="h-64 bg-gray-200 rounded-lg w-full"></div>
    </div>
  );
}
