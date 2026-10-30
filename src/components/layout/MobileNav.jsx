import React from 'react';
import { NAV_ITEMS } from './Sidebar';
import { usePOS } from '../../context/POSContext';

export default function MobileNav({ activeTab, setActiveTab }) {
  const { products } = usePOS();

  const lowStockCount = products.filter(
    (p) => Number(p.stock) <= Number(p.min_stock || 10)
  ).length;

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-200 z-30 safe-area-pb">
      <div className="grid grid-cols-5 h-16 max-w-lg mx-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center gap-1 relative transition-colors ${
                isActive
                  ? 'text-indigo-600 font-semibold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {isActive && (
                <span className="absolute top-0 inset-x-4 h-0.5 bg-indigo-600 rounded-b-full" />
              )}
              <div className="relative">
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
                {item.id === 'inventory' && lowStockCount > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 px-1 min-w-[16px] h-4 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {lowStockCount}
                  </span>
                )}
              </div>
              <span className="text-[11px] leading-none truncate max-w-full px-1">
                {item.shortLabel}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

