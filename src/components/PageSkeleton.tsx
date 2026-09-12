import React from 'react';

export type PageSkeletonVariant = 'hub' | 'dashboard' | 'table' | 'detail' | 'form';

function Bone({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton-shimmer ${className}`} />;
}

function TableRows({ count = 6 }: { count?: number }) {
  return (
    <div className="divide-y divide-gray-100">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center gap-4 px-4 py-4">
          <Bone className="h-9 w-9 shrink-0" />
          <div className="flex-1 space-y-2">
            <Bone className="h-3 w-[42%]" />
            <Bone className="h-2.5 w-[68%]" />
          </div>
          <Bone className="hidden h-7 w-20 sm:block" />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton({ variant = 'table', className = '' }: { variant?: PageSkeletonVariant; className?: string }) {
  const cardCount = variant === 'dashboard' ? 4 : 2;

  return (
    <div role="status" aria-live="polite" aria-label="Carregando conteúdo" className={`w-full animate-in fade-in duration-200 ${className}`}>
      <span className="sr-only">Carregando conteúdo...</span>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className={`space-y-3 ${variant === 'hub' ? 'mx-auto flex w-full flex-col items-center' : 'w-full'}`}>
          <Bone className={`h-7 ${variant === 'hub' ? 'w-56' : 'w-44'}`} />
          <Bone className={`h-3 ${variant === 'hub' ? 'w-72 max-w-full' : 'w-64 max-w-[75%]'}`} />
        </div>
        {variant !== 'hub' && <Bone className="hidden h-9 w-28 shrink-0 sm:block" />}
      </div>

      {variant === 'form' ? (
        <div className="space-y-4">
          <div className="border border-gray-200 bg-white p-8 shadow-sm">
            <Bone className="mx-auto mb-5 h-14 w-14" />
            <Bone className="mx-auto mb-3 h-4 w-52" />
            <Bone className="mx-auto mb-6 h-3 w-72 max-w-full" />
            <Bone className="mx-auto h-10 w-36" />
          </div>
          <div className="border border-gray-200 bg-white p-5 shadow-sm">
            <Bone className="mb-4 h-4 w-36" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Bone className="h-11 w-full" />
              <Bone className="h-11 w-full" />
            </div>
          </div>
        </div>
      ) : variant === 'hub' ? (
        <div className="space-y-4">
          {[0, 1].map(section => (
            <div key={section} className="overflow-hidden border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50 p-4">
                <Bone className="h-9 w-9" />
                <div className="flex-1 space-y-2"><Bone className="h-3.5 w-36" /><Bone className="h-2.5 w-64 max-w-[80%]" /></div>
              </div>
              <TableRows count={3} />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className={`grid gap-3 ${cardCount === 4 ? 'sm:grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-2'}`}>
            {Array.from({ length: cardCount }, (_, index) => (
              <div key={index} className="border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex items-center justify-between"><Bone className="h-3 w-24" /><Bone className="h-8 w-8" /></div>
                <Bone className="mb-3 h-8 w-28" />
                <Bone className="h-2.5 w-36 max-w-full" />
              </div>
            ))}
          </div>

          {variant === 'detail' && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
              <div className="border border-gray-200 bg-white p-5 shadow-sm">
                <Bone className="mb-5 h-11 w-full" />
                <TableRows count={5} />
              </div>
              <div className="space-y-3 border border-gray-200 bg-white p-5 shadow-sm">
                <Bone className="h-4 w-36" />
                <Bone className="h-20 w-full" />
                <Bone className="h-20 w-full" />
                <Bone className="h-10 w-full" />
              </div>
            </div>
          )}

          {variant === 'dashboard' && (
            <div className="grid gap-4 lg:grid-cols-3">
              {[0, 1, 2].map(index => <Bone key={index} className="h-40 w-full border border-gray-200" />)}
            </div>
          )}

          {variant !== 'detail' && (
            <div className="overflow-hidden border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 p-4"><Bone className="h-4 w-40" /><Bone className="h-9 w-32" /></div>
              <TableRows />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SkeletonOverlay({ label = 'Carregando...' }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs" role="status" aria-live="polite">
      <div className="w-full max-w-sm border border-gray-200 bg-white p-6 shadow-2xl">
        <span className="sr-only">{label}</span>
        <div className="flex items-center gap-4">
          <Bone className="h-12 w-12 shrink-0" />
          <div className="flex-1 space-y-3"><Bone className="h-4 w-3/4" /><Bone className="h-3 w-1/2" /></div>
        </div>
        <Bone className="mt-5 h-2.5 w-full" />
      </div>
    </div>
  );
}
