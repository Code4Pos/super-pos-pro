import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check, X, Search } from 'lucide-react';

/**
 * SearchableDropdown:
 * คอมโพเนนต์ Dropdown ที่สามารถพิมพ์ค้นหาได้ (รองรับทั้งการเลือกหมวดหมู่และหน่วยนับ)
 */
export default function SearchableDropdown({
  value,
  onChange,
  options = [], // [{ value: '...', label: '...', badge: '...' }]
  placeholder = 'พิมพ์ค้นหาหรือเลือก...',
  icon: Icon = null,
  allowClear = false,
  defaultValue = '',
  allowCustomValue = false,
  className = '',
  inputClassName = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = useMemo(() => {
    return options.find((opt) => String(opt.value) === String(value)) || null;
  }, [options, value]);

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (opt) =>
        opt.label?.toLowerCase().includes(q) ||
        String(opt.value)?.toLowerCase().includes(q)
    );
  }, [options, query]);

  const displayValue = isOpen
    ? query
    : selectedOption
    ? selectedOption.label
    : allowCustomValue && value
    ? String(value)
    : '';

  const handleSelect = (val) => {
    onChange(val);
    setQuery('');
    setIsOpen(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredOptions.length > 0) {
        handleSelect(filteredOptions[0].value);
      } else if (allowCustomValue && query.trim()) {
        handleSelect(query.trim());
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setQuery('');
    }
  };

  const showClearButton =
    allowClear &&
    ((value && String(value) !== String(defaultValue)) || query.trim());

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="flex items-center rounded-xl border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all">
        {Icon ? (
          <Icon className="w-4 h-4 text-indigo-600 ml-3 mr-1 shrink-0 pointer-events-none" />
        ) : (
          <Search className="w-3.5 h-3.5 text-slate-400 ml-3 mr-1 shrink-0 pointer-events-none" />
        )}

        <input
          type="text"
          data-allow-scanner="false"
          value={displayValue}
          onFocus={() => {
            setIsOpen(true);
            setQuery('');
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            selectedOption
              ? selectedOption.label
              : allowCustomValue && value
              ? String(value)
              : placeholder
          }
          className={`w-full py-2 px-1.5 bg-transparent text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none truncate ${inputClassName}`}
        />

        {showClearButton && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(defaultValue);
              setQuery('');
              setIsOpen(false);
            }}
            className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 shrink-0"
            title="ล้างค่าที่เลือก"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            setIsOpen((prev) => !prev);
            if (!isOpen) setQuery('');
          }}
          className="pr-2.5 pl-1 text-slate-400 hover:text-slate-700 shrink-0"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 max-h-56 overflow-y-auto divide-y divide-slate-100">
          {filteredOptions.length === 0 ? (
            allowCustomValue && query.trim() ? (
              <button
                type="button"
                onClick={() => handleSelect(query.trim())}
                className="w-full px-3.5 py-2.5 text-left text-xs font-bold text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100 flex items-center justify-between"
              >
                <span>ใช้ค่า &ldquo;{query.trim()}&rdquo;</span>
                <Check className="w-3.5 h-3.5 text-indigo-600" />
              </button>
            ) : (
              <div className="p-3 text-center text-xs text-slate-400">
                ไม่พบรายการที่ค้นหา
              </div>
            )
          ) : (
            filteredOptions.map((opt) => {
              const active = String(opt.value) === String(value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelect(opt.value)}
                  className={`w-full px-3.5 py-2 text-left text-xs flex items-center justify-between hover:bg-indigo-50/70 transition-colors ${
                    active
                      ? 'bg-indigo-50 font-bold text-indigo-700'
                      : 'text-slate-700 font-medium'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {opt.badge !== undefined && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                        {opt.badge}
                      </span>
                    )}
                    {active && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

