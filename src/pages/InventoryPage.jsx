import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  Plus,
  Edit3,
  Trash2,
  PackagePlus,
  AlertTriangle,
  MoreVertical,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FolderKanban,
  Scale,
  Smartphone,
  Camera,
  X,
  Clock,
  Layers,
  GitBranch,
  Lock,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
} from 'lucide-react';
import { usePOS } from '../context/POSContext';
import ProductModal from '../components/inventory/ProductModal';
import StockModal from '../components/inventory/StockModal';
import CategoryUnitModal from '../components/inventory/CategoryUnitModal';
import TrashModal from '../components/inventory/TrashModal';
import SearchableDropdown from '../components/common/SearchableDropdown';
import MobileBarcodeModal from '../components/common/MobileBarcodeModal';
import ConfirmModal from '../components/common/ConfirmModal';
import {
  formatCurrency,
  formatNumber,
  formatDateTime,
} from '../utils/formatters';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

/**
 * ไอคอน Grid 9 ช่อง (3x3) สำหรับปุ่มเมนูจัดการหมวดหมู่และหน่วยนับ
 */
function Grid9Icon({ className = 'w-5 h-5' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="3" width="4.5" height="4.5" rx="1" />
      <rect x="9.75" y="3" width="4.5" height="4.5" rx="1" />
      <rect x="16.5" y="3" width="4.5" height="4.5" rx="1" />
      <rect x="3" y="9.75" width="4.5" height="4.5" rx="1" />
      <rect x="9.75" y="9.75" width="4.5" height="4.5" rx="1" />
      <rect x="16.5" y="9.75" width="4.5" height="4.5" rx="1" />
      <rect x="3" y="16.5" width="4.5" height="4.5" rx="1" />
      <rect x="9.75" y="16.5" width="4.5" height="4.5" rx="1" />
      <rect x="16.5" y="16.5" width="4.5" height="4.5" rx="1" />
    </svg>
  );
}

/**
 * Dropdown ที่พิมพ์ไม่ได้ (Non-searchable / Non-typing Dropdown)
 * มีค่าตัวเลข 10, 20, 50, 100 สำหรับเลือกจำนวนแสดงสินค้าในตาราง
 */
function PageSizeDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative inline-block select-none">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-800 shadow-2xs transition-colors min-w-[78px]"
        title="เลือกจำนวนแสดงสินค้าต่อหน้า"
      >
        <span>{value} แถว</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-500 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-28 bg-white rounded-xl shadow-xl border border-slate-200 z-50 py-1 overflow-hidden">
          {PAGE_SIZE_OPTIONS.map((size) => {
            const active = Number(value) === size;
            return (
              <button
                key={size}
                type="button"
                onClick={() => {
                  onChange(size);
                  setOpen(false);
                }}
                className={`w-full px-3 py-1.5 text-left text-xs font-bold flex items-center justify-between transition-colors ${
                  active
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span>{size} รายการ</span>
                {active && <Check className="w-3.5 h-3.5 text-indigo-600" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * แถบเปลี่ยนหน้าตารางรูปแบบ [ < 1 2 3 4 5 6 > ]
 * แสดงทั้งด้านบนและด้านล่างของตารางสินค้า
 */
function TablePaginationBar({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
}) {
  const pageNumbers = useMemo(() => {
    const pages = [];
    const maxVisible = 6;
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i += 1) pages.push(i);
    } else {
      let start = Math.max(1, currentPage - 2);
      let end = start + maxVisible - 1;
      if (end > totalPages) {
        end = totalPages;
        start = Math.max(1, end - maxVisible + 1);
      }
      for (let i = start; i <= end; i += 1) pages.push(i);
    }
    return pages;
  }, [currentPage, totalPages]);

  const startIndex = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(totalItems, currentPage * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2.5 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
      {/* ด้านซ้าย: Dropdown เลือกจำนวนแสดงสินค้า (10, 20, 50, 100) ที่พิมพ์ไม่ได้ */}
      <div className="flex items-center gap-2 text-xs text-slate-600">
        <span className="font-semibold text-slate-500">แสดงต่อหน้า:</span>
        <PageSizeDropdown value={pageSize} onChange={onPageSizeChange} />
        <span className="text-[11px] text-slate-400 hidden sm:inline">
          (แสดง {startIndex}-{endIndex} จากทั้งหมด {totalItems} รายการ)
        </span>
      </div>

      {/* ด้านขวา: ปุ่มเปลี่ยนหน้าตารางรูปแบบ < 1 2 3 4 5 6 > */}
      <div className="inline-flex items-center gap-1 bg-slate-100/90 px-2 py-1 rounded-xl border border-slate-200 select-none">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-colors ${
            currentPage <= 1
              ? 'text-slate-300 cursor-not-allowed'
              : 'text-slate-700 hover:bg-white hover:text-indigo-600 shadow-2xs'
          }`}
          title="หน้าก่อนหน้า (<)"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {pageNumbers.map((pageNum) => {
          const isActive = pageNum === currentPage;
          return (
            <button
              key={pageNum}
              type="button"
              onClick={() => onPageChange(pageNum)}
              className={`min-w-[28px] h-7 px-2 rounded-lg text-xs font-extrabold transition-all ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-700 hover:bg-white hover:text-indigo-600'
              }`}
            >
              {pageNum}
            </button>
          );
        })}

        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-colors ${
            currentPage >= totalPages
              ? 'text-slate-300 cursor-not-allowed'
              : 'text-slate-700 hover:bg-white hover:text-indigo-600 shadow-2xs'
          }`}
          title="หน้าถัดไป (>)"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function InventoryPage() {
  const { products, trashedProducts, categories, deleteProduct } = usePOS();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [stockFilter, setStockFilter] = useState('all'); // 'all' | 'low' | 'out'
  const [isTrashModalOpen, setIsTrashModalOpen] = useState(false);

  // ระบบแบ่งหน้าตาราง (Pagination) และขนาดหน้า (10, 20, 50, 100)
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // ระบบ Sort ทุกหัวข้อตาราง
  const [sortConfig, setSortConfig] = useState({
    key: 'updated_at',
    direction: 'desc', // 'asc' | 'desc'
  });

  // ระบบ Check list เลือกรายการสินค้าด้านหน้าตาราง
  const [checkedProductIds, setCheckedProductIds] = useState([]);

  // ระบบ 3-Point Menu ด้านหน้ารายการสินค้า
  const [openMenuProductId, setOpenMenuProductId] = useState(null);
  const menuContainerRef = useRef(null);

  // ระบบปุ่ม Icon Grid 9 ช่อง เปิดเมนู Dropdown (เพิ่มหมวดหมู่ / เพิ่มหน่วยนับ)
  const [isGridMenuOpen, setIsGridMenuOpen] = useState(false);
  const gridMenuRef = useRef(null);

  // Modal จัดการหมวดหมู่และหน่วยนับ
  const [catUnitModalConfig, setCatUnitModalConfig] = useState({
    isOpen: false,
    initialTab: 'categories',
  });

  // Modal เพิ่ม/แก้ไขสินค้า, ปรับสต็อก, ลบสินค้า
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [stockAdjustProduct, setStockAdjustProduct] = useState(null);
  const [productToDelete, setProductToDelete] = useState(null);
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);

  // Modal แสดง/สแกนบาร์โค้ดผ่านมือถือ
  const [mobileBarcodeConfig, setMobileBarcodeConfig] = useState({
    isOpen: false,
    mode: 'display',
    barcode: '',
    productName: '',
    unitLabel: '',
    onScanResult: null,
  });

  // ปิดเมนู dropdown เมื่อคลิกข้างนอก
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (gridMenuRef.current && !gridMenuRef.current.contains(e.target)) {
        setIsGridMenuOpen(false);
      }
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(e.target)
      ) {
        setOpenMenuProductId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // สรุปข้อมูลคลังสินค้า
  const inventoryStats = useMemo(() => {
    const totalSkus = products.length;
    let totalUnits = 0;
    let totalCostValue = 0;
    let lowStockCount = 0;

    products.forEach((p) => {
      const s = Number(p.stock) || 0;
      const minS = Number(p.min_stock) || 10;
      totalUnits += s;
      totalCostValue += s * (Number(p.cost_price) || 0);
      if (s <= minS) lowStockCount += 1;
    });

    return { totalSkus, totalUnits, totalCostValue, lowStockCount };
  }, [products]);

  // ตัวเลือกหมวดหมู่สำหรับ SearchableDropdown
  const categoryDropdownOptions = useMemo(() => {
    return categories.map((cat) => {
      const count =
        cat.id === 'all'
          ? products.length
          : products.filter((p) => p.category_id === cat.id).length;
      return {
        value: cat.id,
        label: cat.name,
        badge: `${count} รายการ`,
      };
    });
  }, [categories, products]);

  const categoryNameMap = useMemo(() => {
    const map = new Map();
    categories.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [categories]);

  // กรองและเรียงลำดับรายการสินค้าตามหัวข้อตารางที่คลิก
  const filteredAndSortedProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = products.filter((p) => {
      if (selectedCategory !== 'all' && p.category_id !== selectedCategory) {
        return false;
      }
      const stock = Number(p.stock) || 0;
      const minStock = Number(p.min_stock) || 10;
      if (stockFilter === 'low' && (stock > minStock || stock <= 0)) return false;
      if (stockFilter === 'out' && stock > 0) return false;

      if (!q) return true;
      const matchMultiUnit =
        Array.isArray(p.selling_units) &&
        p.selling_units.some(
          (su) =>
            su.barcode?.toLowerCase().includes(q) ||
            su.unit?.toLowerCase().includes(q)
        );
      return (
        p.name?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q) ||
        matchMultiUnit
      );
    });

    const { key, direction } = sortConfig;
    const dirMultiplier = direction === 'asc' ? 1 : -1;

    return [...filtered].sort((a, b) => {
      if (key === 'checked') {
        const aChecked = checkedProductIds.includes(a.id) ? 1 : 0;
        const bChecked = checkedProductIds.includes(b.id) ? 1 : 0;
        return (aChecked - bChecked) * dirMultiplier;
      }
      if (key === 'name') {
        return (
          String(a.name || '').localeCompare(String(b.name || ''), 'th') *
          dirMultiplier
        );
      }
      if (key === 'category') {
        const catA = categoryNameMap.get(a.category_id) || a.category_id || '';
        const catB = categoryNameMap.get(b.category_id) || b.category_id || '';
        return String(catA).localeCompare(String(catB), 'th') * dirMultiplier;
      }
      if (key === 'cost_price') {
        return (
          ((Number(a.cost_price) || 0) - (Number(b.cost_price) || 0)) *
          dirMultiplier
        );
      }
      if (key === 'retail_price') {
        return (
          ((Number(a.retail_price) || 0) - (Number(b.retail_price) || 0)) *
          dirMultiplier
        );
      }
      if (key === 'wholesale_price') {
        return (
          ((Number(a.wholesale_price) || 0) - (Number(b.wholesale_price) || 0)) *
          dirMultiplier
        );
      }
      if (key === 'stock') {
        return ((Number(a.stock) || 0) - (Number(b.stock) || 0)) * dirMultiplier;
      }
      if (key === 'updated_at') {
        const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
        const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
        return (timeA - timeB) * dirMultiplier;
      }
      return 0;
    });
  }, [
    products,
    selectedCategory,
    stockFilter,
    searchQuery,
    sortConfig,
    checkedProductIds,
    categoryNameMap,
  ]);

  // รีเซ็ตไปหน้า 1 เมื่อเปลี่ยนคำค้นหา, หมวดหมู่, ตัวกรองสต็อก หรือจำนวนแถวต่อหน้า
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, stockFilter, pageSize]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredAndSortedProducts.length / pageSize)
  );

  // ป้องกันกรณีลบสินค้าแล้วหน้าปัจจุบันเกินจำนวนหน้าทั้งหมด
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedProducts.slice(start, start + pageSize);
  }, [filteredAndSortedProducts, currentPage, pageSize]);

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const renderSortIcon = (colKey) => {
    if (sortConfig.key !== colKey) {
      return <ArrowUpDown className="w-3 h-3 text-slate-400 shrink-0" />;
    }
    return sortConfig.direction === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-indigo-600 shrink-0" />
    ) : (
      <ArrowDown className="w-3 h-3 text-indigo-600 shrink-0" />
    );
  };

  // จัดการ Check list ในหน้าปัจจุบัน
  const isAllVisibleChecked =
    paginatedProducts.length > 0 &&
    paginatedProducts.every((p) => checkedProductIds.includes(p.id));

  const handleToggleAllVisible = () => {
    if (isAllVisibleChecked) {
      const visibleSet = new Set(paginatedProducts.map((p) => p.id));
      setCheckedProductIds((prev) => prev.filter((id) => !visibleSet.has(id)));
    } else {
      const visibleIds = paginatedProducts.map((p) => p.id);
      setCheckedProductIds((prev) =>
        Array.from(new Set([...prev, ...visibleIds]))
      );
    }
  };

  const handleToggleOne = (productId) => {
    setCheckedProductIds((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-5 pb-24 lg:pb-8 space-y-3.5">
      {/* การ์ดสรุปภาพรวมคลังสินค้า */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-xs font-medium text-slate-500">รายการสินค้าทั้งหมด</div>
          <div className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-0.5">
            {formatNumber(inventoryStats.totalSkus)}{' '}
            <span className="text-xs font-normal text-slate-500">รายการ</span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-xs font-medium text-slate-500">จำนวนชิ้นรวมในคลัง</div>
          <div className="text-xl sm:text-2xl font-extrabold text-indigo-600 mt-0.5">
            {formatNumber(inventoryStats.totalUnits)}{' '}
            <span className="text-xs font-normal text-slate-500">หน่วย</span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-xs font-medium text-slate-500">มูลค่าต้นทุนสินค้าคงคลัง</div>
          <div className="text-xl sm:text-2xl font-extrabold text-emerald-600 mt-0.5">
            {formatCurrency(inventoryStats.totalCostValue)}
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-amber-200 bg-amber-50/40 shadow-xs">
          <div className="text-xs font-semibold text-amber-800 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span>สินค้าใกล้หมด / หมดสต็อก</span>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-amber-700 mt-0.5">
            {inventoryStats.lowStockCount}{' '}
            <span className="text-xs font-normal">รายการ</span>
          </div>
        </div>
      </div>

      {/* แถบเครื่องมือค้นหา, เลือกหมวดหมู่แบบ Searchable Dropdown, ปุ่ม Grid 9 ช่อง และปุ่มเพิ่มสินค้า */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          {/* ช่องค้นหาสินค้า + ปุ่มสแกนบาร์โค้ดผ่านมือถือ */}
          <div className="relative flex-1 flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาชื่อสินค้า, SKU หรือเลขบาร์โค้ด (รวมถึงบาร์โค้ดหลายหน่วย)..."
                className="w-full pl-10 pr-8 py-2 rounded-xl border border-slate-200 bg-slate-50/70 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() =>
                setMobileBarcodeConfig({
                  isOpen: true,
                  mode: 'scan',
                  barcode: searchQuery,
                  productName: 'ค้นหาสินค้าด้วยบาร์โค้ดผ่านมือถือ',
                  unitLabel: '',
                  onScanResult: (code) => setSearchQuery(code),
                })
              }
              className="p-2.5 rounded-xl border border-slate-200 hover:bg-indigo-50 text-indigo-600 shrink-0"
              title="สแกนบาร์โค้ดค้นหาสินค้าผ่านมือถือ"
            >
              <Camera className="w-4 h-4" />
            </button>
          </div>

          {/* เลือกหมวดหมู่สินค้า (Searchable Dropdown) + ปุ่ม Grid 9 ช่อง + ปุ่มเพิ่มสินค้าใหม่ */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* เลือกหมวดหมู่เป็น Dropdown ที่สามารถพิมพ์ค้นหาได้ */}
            <div className="w-full sm:w-64">
              <SearchableDropdown
                value={selectedCategory}
                onChange={(val) => setSelectedCategory(val || 'all')}
                options={categoryDropdownOptions}
                icon={FolderKanban}
                allowClear={true}
                defaultValue="all"
                placeholder="พิมพ์ค้นหาหมวดหมู่สินค้า..."
              />
            </div>

            {/* ปุ่ม Icon Grid 9 ช่อง กดแล้วเป็นเมนู Dropdown (เพิ่มหมวดหมู่ / เพิ่มหน่วยนับ / ถังขยะ) */}
            <div ref={gridMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setIsGridMenuOpen((prev) => !prev)}
                className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-colors ${
                  isGridMenuOpen
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
                title="จัดการหมวดหมู่สินค้า และ หน่วยนับ"
              >
                <Grid9Icon className="w-5 h-5" />
              </button>

              {isGridMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 py-1.5 divide-y divide-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setIsGridMenuOpen(false);
                      setCatUnitModalConfig({
                        isOpen: true,
                        initialTab: 'categories',
                      });
                    }}
                    className="w-full px-4 py-2.5 text-left text-xs sm:text-sm font-bold text-slate-800 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2.5 transition-colors"
                  >
                    <FolderKanban className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>เพิ่มหมวดหมู่</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsGridMenuOpen(false);
                      setCatUnitModalConfig({
                        isOpen: true,
                        initialTab: 'units',
                      });
                    }}
                    className="w-full px-4 py-2.5 text-left text-xs sm:text-sm font-bold text-slate-800 hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-2.5 transition-colors"
                  >
                    <Scale className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>เพิ่มหน่วยนับ</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsGridMenuOpen(false);
                      setIsTrashModalOpen(true);
                    }}
                    className="w-full px-4 py-2.5 text-left text-xs sm:text-sm font-bold text-rose-600 hover:bg-rose-50 flex items-center justify-between gap-2 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Trash2 className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>ถังขยะ</span>
                    </div>
                    {trashedProducts.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-700">
                        {trashedProducts.length}
                      </span>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* ปุ่มเพิ่มสินค้าใหม่ */}
            <button
              type="button"
              onClick={() => {
                setEditingProduct(null);
                setIsProductModalOpen(true);
              }}
              className="py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>เพิ่มสินค้าใหม่</span>
            </button>
          </div>
        </div>

        {/* แถบกรองสถานะสต็อก + แถบจัดการเมื่อมีการติ๊ก Check list */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            {[
              { id: 'all', label: 'สินค้าทั้งหมด' },
              { id: 'low', label: 'ใกล้หมดสต็อก' },
              { id: 'out', label: 'สินค้าหมด' },
            ].map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setStockFilter(st.id)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  stockFilter === st.id
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {checkedProductIds.length > 0 ? (
            <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-xl">
              <span className="text-xs font-bold text-indigo-800">
                เลือกแล้ว {checkedProductIds.length} รายการ
              </span>
              <button
                type="button"
                onClick={() => setIsBulkDeleteConfirmOpen(true)}
                className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                <span>ลบที่เลือก</span>
              </button>
              <button
                type="button"
                onClick={() => setCheckedProductIds([])}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-1.5"
              >
                ยกเลิก
              </button>
            </div>
          ) : (
            <span className="text-[11px] text-slate-400">
              พบ {filteredAndSortedProducts.length} รายการ • คลิกที่ชื่อสินค้าเพื่อแก้ไขได้ทันที
            </span>
          )}
        </div>
      </div>

      {/* แถบเปลี่ยนหน้าตาราง (Pagination) ด้านบนของตาราง [ < 1 2 3 4 5 6 > ] */}
      <TablePaginationBar
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={filteredAndSortedProducts.length}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
      />

      {/* ตารางรายการสินค้า */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-visible">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider select-none">
                {/* หัวข้อที่ 1: Check list & 3-point menu ด้านหน้า */}
                <th className="py-3.5 px-3 w-20">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isAllVisibleChecked}
                      onChange={handleToggleAllVisible}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      title="เลือกทั้งหมดในหน้านี้"
                    />
                    <button
                      type="button"
                      onClick={() => handleSort('checked')}
                      className="inline-flex items-center gap-0.5 hover:text-indigo-600"
                      title="เรียงตามรายการที่ติ๊กเลือก"
                    >
                      <span>เลือก</span>
                      {renderSortIcon('checked')}
                    </button>
                  </div>
                </th>

                {/* หัวข้อที่ 2: สินค้า / รหัส SKU */}
                <th className="py-3.5 px-3">
                  <button
                    type="button"
                    onClick={() => handleSort('name')}
                    className="inline-flex items-center gap-1 hover:text-indigo-600 uppercase"
                  >
                    <span>สินค้า / รหัส SKU</span>
                    {renderSortIcon('name')}
                  </button>
                </th>

                {/* หัวข้อที่ 3: หมวดหมู่ */}
                <th className="py-3.5 px-3">
                  <button
                    type="button"
                    onClick={() => handleSort('category')}
                    className="inline-flex items-center gap-1 hover:text-indigo-600 uppercase"
                  >
                    <span>หมวดหมู่</span>
                    {renderSortIcon('category')}
                  </button>
                </th>

                {/* หัวข้อที่ 4: ราคาทุน */}
                <th className="py-3.5 px-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleSort('cost_price')}
                    className="inline-flex items-center justify-end gap-1 hover:text-indigo-600 uppercase ml-auto"
                  >
                    <span>ราคาทุน</span>
                    {renderSortIcon('cost_price')}
                  </button>
                </th>

                {/* หัวข้อที่ 5: ราคาขายปลีก */}
                <th className="py-3.5 px-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleSort('retail_price')}
                    className="inline-flex items-center justify-end gap-1 hover:text-indigo-600 uppercase ml-auto"
                  >
                    <span>ราคาขายปลีก</span>
                    {renderSortIcon('retail_price')}
                  </button>
                </th>

                {/* หัวข้อที่ 6: ราคาขายส่ง (ขั้นต่ำ) */}
                <th className="py-3.5 px-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleSort('wholesale_price')}
                    className="inline-flex items-center justify-end gap-1 hover:text-indigo-600 uppercase ml-auto"
                  >
                    <span>ราคาขายส่ง (ขั้นต่ำ)</span>
                    {renderSortIcon('wholesale_price')}
                  </button>
                </th>

                {/* หัวข้อที่ 7: สินค้าคงเหลือ แบ่งเป็น 2 ช่อง (เต็ม | เศษ) */}
                <th className="py-2 px-2 text-center min-w-[210px]">
                  <div className="flex flex-col items-center">
                    <button
                      type="button"
                      onClick={() => handleSort('stock')}
                      className="inline-flex items-center justify-center gap-1 hover:text-indigo-600 uppercase pb-1"
                    >
                      <span>สินค้าคงเหลือ</span>
                      {renderSortIcon('stock')}
                    </button>
                    <div className="w-full grid grid-cols-2 divide-x divide-slate-200 border-t border-slate-200 pt-1 text-[10px] font-extrabold text-slate-500">
                      <span className="text-center">เต็ม</span>
                      <span className="text-center">เศษ</span>
                    </div>
                  </div>
                </th>

                {/* หัวข้อที่ 8 (หลังสุด): คอลัมน์ "ล่าสุด" */}
                <th className="py-3.5 px-4 text-right">
                  <button
                    type="button"
                    onClick={() => handleSort('updated_at')}
                    className="inline-flex items-center justify-end gap-1 hover:text-indigo-600 uppercase ml-auto"
                  >
                    <span>ล่าสุด</span>
                    {renderSortIcon('updated_at')}
                  </button>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200/70 text-xs sm:text-sm">
              {paginatedProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    ไม่พบรายการสินค้าที่ค้นหา
                  </td>
                </tr>
              ) : (
                paginatedProducts.map((product) => {
                  const stock = Number(product.stock) || 0;
                  const minStock = Number(product.min_stock) || 10;
                  const isLow = stock <= minStock && stock > 0;
                  const isOut = stock <= 0;
                  const isChecked = checkedProductIds.includes(product.id);
                  const isMenuOpen = openMenuProductId === product.id;
                  const catName =
                    categoryNameMap.get(product.category_id) ||
                    product.category_id;
                  const sellingUnits = Array.isArray(product.selling_units)
                    ? product.selling_units
                    : [];
                  const masterLinkedProd = product.linked_product_id
                    ? products.find((p) => p.id === product.linked_product_id)
                    : null;
                  const childLinkedCount = products.filter(
                    (p) => p.linked_product_id === product.id
                  ).length;
                  const wholesaleEnabled =
                    product.is_wholesale_enabled !== false &&
                    Number(product.wholesale_price) > 0;

                  return (
                    <tr
                      key={product.id}
                      className={`hover:bg-slate-50/90 transition-colors ${
                        isChecked ? 'bg-indigo-50/40' : ''
                      }`}
                    >
                      {/* คอลัมน์ด้านหน้า: Check list + 3-point menu (ปรับสต๊อก / แก้ไข / ลบ) */}
                      <td className="py-3 px-3 relative">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleOne(product.id)}
                            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />

                          <div
                            ref={isMenuOpen ? menuContainerRef : null}
                            className="relative"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setOpenMenuProductId(
                                  isMenuOpen ? null : product.id
                                )
                              }
                              className={`p-1.5 rounded-lg transition-colors ${
                                isMenuOpen
                                  ? 'bg-slate-900 text-white'
                                  : 'text-slate-500 hover:bg-slate-200/70 hover:text-slate-900'
                              }`}
                              title="เมนูจัดการสินค้า"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>

                            {isMenuOpen && (
                              <div className="absolute left-0 top-full mt-1 w-48 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 py-1.5 divide-y divide-slate-100">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuProductId(null);
                                    setStockAdjustProduct(product);
                                  }}
                                  className="w-full px-3.5 py-2 text-left text-xs font-bold text-slate-800 hover:bg-indigo-50 hover:text-indigo-700 flex items-center justify-between gap-2"
                                  title="ปรับสต็อกสินค้า (หากเป็นสินค้าสัมพันธ์ จำนวนสต็อกจะซิงค์เชื่อมกันอัตโนมัติ)"
                                >
                                  <span className="inline-flex items-center gap-2">
                                    <PackagePlus className="w-4 h-4 text-indigo-600" />
                                    <span>ปรับสต๊อก</span>
                                  </span>
                                  {masterLinkedProd && (
                                    <GitBranch
                                      className="w-3.5 h-3.5 text-violet-600 shrink-0"
                                      title="ซิงค์สต็อกกับสินค้าหลักอัตโนมัติ"
                                    />
                                  )}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuProductId(null);
                                    setEditingProduct(product);
                                    setIsProductModalOpen(true);
                                  }}
                                  className="w-full px-3.5 py-2 text-left text-xs font-bold text-slate-800 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2"
                                >
                                  <Edit3 className="w-4 h-4 text-emerald-600" />
                                  <span>แก้ไข</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuProductId(null);
                                    setProductToDelete(product);
                                  }}
                                  className="w-full px-3.5 py-2 text-left text-xs font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                                >
                                  <Trash2 className="w-4 h-4 text-rose-600" />
                                  <span>ลบ</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* คอลัมน์ที่ 2: ชื่อสินค้า (กดที่ชื่อสินค้าเพื่อแก้ไขได้ทันที) + SKU + บาร์โค้ด */}
                      <td className="py-3 px-3">
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingProduct(product);
                              setIsProductModalOpen(true);
                            }}
                            className="font-bold text-slate-900 hover:text-indigo-600 hover:underline text-left line-clamp-1 transition-colors"
                            title="คลิกที่ชื่อสินค้าเพื่อแก้ไขข้อมูลสินค้า"
                          >
                            {product.name}
                          </button>

                          <div className="text-[11px] text-slate-400 font-mono flex flex-wrap items-center gap-2 mt-0.5">
                            <span className="font-semibold text-slate-500">
                              {product.sku}
                            </span>

                            {product.barcode && (
                              <button
                                type="button"
                                onClick={() =>
                                  setMobileBarcodeConfig({
                                    isOpen: true,
                                    mode: 'display',
                                    barcode: product.barcode,
                                    productName: product.name,
                                    unitLabel: product.unit,
                                    onScanResult: null,
                                  })
                                }
                                className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 transition-colors"
                                title="คลิกเพื่อแสดงบาร์โค้ดผ่านมือถือ"
                              >
                                <Smartphone className="w-3 h-3 text-indigo-500" />
                                <span>{product.barcode}</span>
                              </button>
                            )}

                            {sellingUnits.length > 0 && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-sans text-[10px] font-bold">
                                <Layers className="w-2.5 h-2.5" />
                                <span>
                                  {sellingUnits
                                    .map(
                                      (u) =>
                                        `${u.unit}(ตัด ${u.stock_deduct_qty})`
                                    )
                                    .join(', ')}
                                </span>
                              </span>
                            )}

                            {masterLinkedProd && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-violet-50 text-violet-700 border border-violet-200 font-sans text-[10px] font-bold">
                                <GitBranch className="w-2.5 h-2.5" />
                                <span>
                                  เชื่อม: {masterLinkedProd.name} (ตัด{' '}
                                  {product.linked_deduct_qty}{' '}
                                  {masterLinkedProd.unit})
                                </span>
                              </span>
                            )}

                            {childLinkedCount > 0 && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-sans text-[10px] font-bold">
                                <GitBranch className="w-2.5 h-2.5" />
                                <span>
                                  สินค้าหลัก (เชื่อม {childLinkedCount} รายการ)
                                </span>
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* คอลัมน์ที่ 3: หมวดหมู่ */}
                      <td className="py-3 px-3">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium whitespace-nowrap">
                          {catName}
                        </span>
                      </td>

                      {/* คอลัมน์ที่ 4: ราคาทุน (แสดงต้นทุนสัมพันธ์และไอคอนล็อกสำหรับสินค้ารอง) */}
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1 font-medium text-slate-600">
                          {masterLinkedProd && (
                            <Lock
                              className="w-3 h-3 text-violet-500 shrink-0"
                              title="ต้นทุนสัมพันธ์ตามสินค้าหลัก (ล็อกการแก้ไข)"
                            />
                          )}
                          <span
                            className={
                              masterLinkedProd
                                ? 'text-violet-700 font-bold'
                                : ''
                            }
                          >
                            {formatCurrency(product.cost_price)}
                          </span>
                        </div>
                      </td>

                      {/* คอลัมน์ที่ 5: ราคาขายปลีก */}
                      <td className="py-3 px-3 text-right font-bold text-slate-900 whitespace-nowrap">
                        {formatCurrency(product.retail_price)}
                        <span className="text-[11px] font-normal text-slate-400">
                          /{product.unit}
                        </span>
                      </td>

                      {/* คอลัมน์ที่ 6: ราคาขายส่ง */}
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        {wholesaleEnabled ? (
                          <>
                            <div className="font-bold text-emerald-600">
                              {formatCurrency(product.wholesale_price)}
                            </div>
                            <div className="text-[10px] text-emerald-700 font-medium">
                              ตั้งแต่ {product.wholesale_min_qty} {product.unit}
                            </div>
                          </>
                        ) : (
                          <span className="text-xs text-slate-300 font-medium">
                            ปิดราคาส่ง
                          </span>
                        )}
                      </td>

                      {/* คอลัมน์ที่ 7: สินค้าคงเหลือ แบ่งเป็น 2 ช่อง (เต็ม | เศษ) */}
                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        {masterLinkedProd ? (
                          (() => {
                            const masterStockVal =
                              Number(masterLinkedProd.stock) || 0;
                            const deductMult = Math.max(
                              1,
                              Number(product.linked_deduct_qty) || 1
                            );
                            const fullUnits = Math.floor(
                              masterStockVal / deductMult
                            );
                            const remainderUnits = masterStockVal % deductMult;
                            return (
                              <div
                                onClick={() => setStockAdjustProduct(product)}
                                className="grid grid-cols-2 divide-x divide-slate-200 items-center rounded-xl border border-slate-200/90 bg-slate-50/70 hover:border-indigo-300 hover:bg-indigo-50/30 cursor-pointer py-1 px-1 transition-colors"
                                title="คลิกเพื่อปรับสต็อกสินค้าสัมพันธ์ (ซิงค์กับสินค้าหลักอัตโนมัติ)"
                              >
                                {/* ช่องที่ 1: เต็ม */}
                                <div className="px-2 text-center">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                                      fullUnits <= 0
                                        ? 'bg-rose-100 text-rose-700'
                                        : isLow
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-violet-100 text-violet-800'
                                    }`}
                                  >
                                    {fullUnits} {product.unit}
                                  </span>
                                </div>

                                {/* ช่องที่ 2: เศษ */}
                                <div className="px-2 text-center">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-slate-200/80 text-slate-700">
                                    {remainderUnits}{' '}
                                    {masterLinkedProd.unit || 'ชิ้น'}
                                  </span>
                                </div>
                              </div>
                            );
                          })()
                        ) : (
                          /* กรณีเป็นสินค้าตัวหลัก (หรือไม่ได้เป็นสินค้ารอง): แสดงจำนวนสต็อกแค่ในช่อง "เศษ" เท่านั้น */
                          <div
                            onClick={() => setStockAdjustProduct(product)}
                            className="grid grid-cols-2 divide-x divide-slate-200 items-center rounded-xl border border-slate-200/80 bg-slate-50/50 hover:border-indigo-300 hover:bg-indigo-50/30 cursor-pointer py-1 px-1 transition-colors"
                            title="คลิกเพื่อปรับสต็อกสินค้า"
                          >
                            {/* ช่องที่ 1: เต็ม (สินค้าตัวหลักไม่แสดงในช่องเต็ม) */}
                            <div className="px-2 text-center text-xs font-bold text-slate-300 select-none">
                              -
                            </div>

                            {/* ช่องที่ 2: เศษ (แสดงจำนวนสต็อกของสินค้าตัวหลัก) */}
                            <div className="px-2 text-center">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                  isOut
                                    ? 'bg-rose-100 text-rose-700'
                                    : isLow
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-emerald-50 text-emerald-700'
                                }`}
                              >
                                {stock} {product.unit}
                              </span>
                            </div>
                          </div>
                        )}
                      </td>

                      {/* คอลัมน์ที่ 8 (หลังสุด): "ล่าสุด" แสดงวันที่และเวลาที่สินค้ามีการแก้ไขล่าสุด */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                          <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>
                            {formatDateTime(
                              product.updated_at || product.created_at
                            )}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* แถบเปลี่ยนหน้าตาราง (Pagination) ด้านล่างของตาราง [ < 1 2 3 4 5 6 > ] */}
      <TablePaginationBar
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={filteredAndSortedProducts.length}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
      />

      {/* Modal เพิ่ม/แก้ไขสินค้า */}
      <ProductModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        editingProduct={editingProduct}
      />

      {/* Modal ปรับสต็อกสินค้า */}
      <StockModal
        product={stockAdjustProduct}
        onClose={() => setStockAdjustProduct(null)}
      />

      {/* Modal จัดการหมวดหมู่สินค้า & หน่วยนับ (เพิ่ม / ลบ / แก้ไข) */}
      <CategoryUnitModal
        isOpen={catUnitModalConfig.isOpen}
        initialTab={catUnitModalConfig.initialTab}
        onClose={() =>
          setCatUnitModalConfig((prev) => ({ ...prev, isOpen: false }))
        }
      />

      {/* Modal ถังขยะสินค้า */}
      <TrashModal
        isOpen={isTrashModalOpen}
        onClose={() => setIsTrashModalOpen(false)}
      />

      {/* Modal แสดง/สแกนบาร์โค้ดผ่านมือถือ */}
      <MobileBarcodeModal
        isOpen={mobileBarcodeConfig.isOpen}
        initialMode={mobileBarcodeConfig.mode}
        initialBarcode={mobileBarcodeConfig.barcode}
        productName={mobileBarcodeConfig.productName}
        unitLabel={mobileBarcodeConfig.unitLabel}
        onClose={() =>
          setMobileBarcodeConfig((prev) => ({ ...prev, isOpen: false }))
        }
        onSelectBarcode={mobileBarcodeConfig.onScanResult}
      />

      {/* Modal ยืนยันการลบสินค้าเดี่ยว (ย้ายไปถังขยะ) */}
      <ConfirmModal
        isOpen={Boolean(productToDelete)}
        title="ยืนยันการย้ายสินค้าไปยังถังขยะ"
        message={
          productToDelete
            ? `คุณต้องการลบสินค้า "${productToDelete.name}" (${productToDelete.sku}) ไปไว้ในถังขยะใช่หรือไม่? (หากสินค้านี้เป็นสินค้าตัวหลัก การเชื่อมสินค้าสัมพันธ์ในสินค้ารองจะถูกยกเลิกอัตโนมัติ และสามารถกู้คืนได้จากเมนูถังขยะ)`
            : ''
        }
        confirmText="ย้ายไปถังขยะ"
        cancelText="ยกเลิก"
        variant="danger"
        onCancel={() => setProductToDelete(null)}
        onConfirm={() => {
          if (productToDelete) {
            deleteProduct(productToDelete.id);
            setCheckedProductIds((prev) =>
              prev.filter((id) => id !== productToDelete.id)
            );
            setProductToDelete(null);
          }
        }}
      />

      {/* Modal ยืนยันการลบสินค้าที่ติ๊กเลือกหลายรายการ (ย้ายไปถังขยะ) */}
      <ConfirmModal
        isOpen={isBulkDeleteConfirmOpen}
        title="ยืนยันการย้ายรายการที่เลือกไปยังถังขยะ"
        message={`คุณต้องการย้ายสินค้าที่ติ๊กเลือกจำนวน ${checkedProductIds.length} รายการ ไปไว้ในถังขยะใช่หรือไม่?`}
        confirmText={`ย้ายไปถังขยะ (${checkedProductIds.length} รายการ)`}
        cancelText="ยกเลิก"
        variant="danger"
        onCancel={() => setIsBulkDeleteConfirmOpen(false)}
        onConfirm={async () => {
          for (const id of checkedProductIds) {
            await deleteProduct(id);
          }
          setCheckedProductIds([]);
          setIsBulkDeleteConfirmOpen(false);
        }}
      />
    </div>
  );
}
