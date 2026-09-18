import { useState, useRef, useMemo } from 'react';
import { useLang } from '@/context/LanguageContext';
import { useRoute } from '@/context/RouteContext';
import { useWishlist } from '@/context/WishlistContext';
import { materials } from '@/data/materials';
import { rooms } from '@/data/content';
import type { MaterialType, Colour } from '@/data/types';
import { Reveal, LazyImage } from '@/components/ui/Reveal';
import {
  ArrowLeft, ArrowRight, Upload, X, ZoomIn, RotateCcw, Maximize2,
  Heart, Download, Share2, ChevronLeft, ChevronRight, Check,
} from 'lucide-react';

type Step = 'room' | 'surface' | 'material' | 'result';

export function VisualizerPage() {
  const { t, lang } = useLang();
  const { navigate, path } = useRoute();
  const { toggle, has } = useWishlist();

  const params = new URLSearchParams(path.split('?')[1] || '');
  const presetMaterialSlug = params.get('material');

  const [step, setStep] = useState<Step>('room');
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedSurfaceId, setSelectedSurfaceId] = useState<string | null>(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(
    presetMaterialSlug ? materials.find((m) => m.slug === presetMaterialSlug)?.id || null : null
  );
  const [showCompare, setShowCompare] = useState(false);
  const [compareMaterialId, setCompareMaterialId] = useState<string | null>(null);
  const [uploadMode, setUploadMode] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadSurface, setUploadSurface] = useState<string>('floor');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<MaterialType | 'All'>('All');
  const [sliderPos, setSliderPos] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [showSaved, setShowSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId);
  const selectedSurface = selectedRoom?.surfaces.find((s) => s.id === selectedSurfaceId);
  const selectedMaterial = materials.find((m) => m.id === selectedMaterialId);
  const compareMaterial = materials.find((m) => m.id === compareMaterialId);

  const filteredMaterials = useMemo(() => {
    return materials.filter((m) => {
      if (searchQuery && !m.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filterCategory !== 'All' && m.category !== filterCategory) return false;
      return true;
    });
  }, [searchQuery, filterCategory]);

  const roomImage = uploadedImage || selectedRoom?.image || null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setUploadedImage(ev.target?.result as string);
        setUploadMode(true);
        setSelectedRoomId(null);
        setSelectedSurfaceId(null);
        setStep('surface');
      };
      reader.readAsDataURL(file);
    }
  };

  const applySurfaceClip = (surfaceId: string): string => {
    if (uploadMode) {
      if (surfaceId === 'floor') return 'polygon(0 55%, 100% 55%, 100% 100%, 0 100%)';
      if (surfaceId === 'wall') return 'polygon(0 0, 100% 0, 100% 55%, 0 55%)';
      if (surfaceId === 'countertop') return 'polygon(0 40%, 100% 40%, 100% 60%, 0 60%)';
    }
    const surface = selectedRoom?.surfaces.find((s) => s.id === surfaceId);
    return surface?.clipPath || 'polygon(0 0, 100% 0, 100% 100%, 0 100%)';
  };

  const uploadSurfaces = [
    { id: 'floor', name: 'Floor', nameAr: 'الأرضية' },
    { id: 'wall', name: 'Wall', nameAr: 'الجدار' },
    { id: 'countertop', name: 'Countertop', nameAr: 'الجزيرة' },
  ];

  const steps: Step[] = ['room', 'surface', 'material', 'result'];
  const currentStepIndex = steps.indexOf(step);

  return (
    <div className="pt-20 md:pt-24 min-h-screen bg-stone-100">
      {/* Header */}
      <div className="container-lux py-8">
        <Reveal>
          <h1 className="font-display text-display font-light text-stone-900 mb-2">{t('visualizer')}</h1>
          <p className="text-sm text-stone-500">{t('visualizerTitle')}</p>
        </Reveal>
      </div>

      {/* Step Indicator */}
      <div className="container-lux mb-8">
        <div className="flex items-center gap-2 md:gap-4">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2 md:gap-4">
              <div className={`flex items-center gap-2 ${i <= currentStepIndex ? 'text-stone-900' : 'text-stone-400'}`}>
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs border transition-all ${
                  i === currentStepIndex ? 'bg-stone-900 text-ivory border-stone-900' :
                  i < currentStepIndex ? 'bg-stone-200 text-stone-900 border-stone-200' :
                  'border-stone-300'
                }`}>
                  {i < currentStepIndex ? <Check size={12} strokeWidth={2} /> : i + 1}
                </span>
                <span className="text-xs tracking-[0.15em] uppercase hidden md:inline">
                  {s === 'room' ? t('chooseRoom') : s === 'surface' ? t('chooseSurface') : s === 'material' ? t('chooseMaterial') : t('applyMaterial')}
                </span>
              </div>
              {i < steps.length - 1 && <div className={`w-8 md:w-16 h-px ${i < currentStepIndex ? 'bg-stone-900' : 'bg-stone-300'}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* Step 1: Choose Room */}
      {step === 'room' && (
        <div className="container-lux pb-20">
          {/* Upload Option */}
          <Reveal>
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full mb-8 border-2 border-dashed border-stone-300 hover:border-stone-900 transition-colors p-8 md:p-12 flex flex-col items-center gap-3 text-stone-600 hover:text-stone-900"
            >
              <Upload size={28} strokeWidth={1.5} />
              <p className="font-display text-xl font-light">{t('uploadYourRoom')}</p>
              <p className="text-sm text-stone-500">{t('uploadRoomDesc')}</p>
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
          </Reveal>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {rooms.map((room, i) => (
              <Reveal key={room.id} delay={i * 60}>
                <button
                  onClick={() => {
                    setSelectedRoomId(room.id);
                    setUploadMode(false);
                    setUploadedImage(null);
                    setStep('surface');
                  }}
                  className="group relative block w-full overflow-hidden"
                >
                  <LazyImage
                    src={room.image}
                    alt={lang === 'ar' ? room.nameAr : room.name}
                    aspectClass="aspect-[4/3]"
                    className="transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-stone-950/20 group-hover:bg-stone-950/40 transition-colors" />
                  <p className="absolute bottom-3 left-0 right-0 text-center text-sm tracking-[0.15em] uppercase text-white font-light">
                    {lang === 'ar' ? room.nameAr : room.name}
                  </p>
                </button>
              </Reveal>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Choose Surface */}
      {step === 'surface' && roomImage && (
        <div className="container-lux pb-20">
          <div className="flex items-center gap-4 mb-6">
            <button onClick={() => { setStep('room'); setUploadMode(false); setUploadedImage(null); }} className="flex items-center gap-2 text-xs tracking-[0.15em] uppercase text-stone-500 hover:text-stone-900">
              <ArrowLeft size={14} strokeWidth={1.5} className="rtl:rotate-180" />
              {t('changeRoom')}
            </button>
          </div>

          <div className="relative aspect-[16/10] overflow-hidden bg-stone-200 mb-6">
            <img src={roomImage} alt="Room" className="w-full h-full object-cover" />
            {/* Surface Overlays */}
            {(uploadMode ? uploadSurfaces : selectedRoom?.surfaces || []).map((surface) => {
              const clip = uploadMode
                ? surface.id === 'floor' ? 'polygon(0 55%, 100% 55%, 100% 100%, 0 100%)'
                  : surface.id === 'wall' ? 'polygon(0 0, 100% 0, 100% 55%, 0 55%)'
                  : 'polygon(0 40%, 100% 40%, 100% 60%, 0 60%)'
                : (surface as { clipPath?: string }).clipPath || 'polygon(0 0, 100% 0, 100% 100%, 0 100%)';
              return (
                <button
                  key={surface.id}
                  onClick={() => {
                    setSelectedSurfaceId(surface.id);
                    setStep('material');
                  }}
                  className="absolute inset-0 group transition-all"
                  style={{ clipPath: clip }}
                >
                  <div className="w-full h-full bg-accent/0 group-hover:bg-accent/30 transition-colors duration-300 flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-sm tracking-[0.15em] uppercase bg-stone-900/80 px-4 py-2">
                      {lang === 'ar' ? surface.nameAr : surface.name}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-3 justify-center">
            {(uploadMode ? uploadSurfaces : selectedRoom?.surfaces || []).map((surface) => (
              <button
                key={surface.id}
                onClick={() => {
                  setSelectedSurfaceId(surface.id);
                  setStep('material');
                }}
                className="filter-chip"
              >
                {lang === 'ar' ? surface.nameAr : surface.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Choose Material */}
      {step === 'material' && (
        <div className="container-lux pb-20">
          <div className="flex items-center justify-between mb-6">
            <button onClick={() => setStep('surface')} className="flex items-center gap-2 text-xs tracking-[0.15em] uppercase text-stone-500 hover:text-stone-900">
              <ArrowLeft size={14} strokeWidth={1.5} className="rtl:rotate-180" />
              {t('changeSurface')}
            </button>
          </div>

          {/* Search + Filter */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('searchMaterials')}
              className="flex-1 bg-ivory border border-stone-200 px-4 py-3 text-sm focus:border-stone-900 focus:outline-none"
            />
            <div className="flex gap-2 overflow-x-auto scrollbar-hide">
              {(['All', 'Marble', 'Porcelain', 'Ceramic', 'Granite', 'Travertine', 'Onyx'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={`filter-chip shrink-0 ${filterCategory === cat ? 'filter-chip-active' : ''}`}
                >
                  {cat === 'All' ? t('all') : cat}
                </button>
              ))}
            </div>
          </div>

          {/* Material Grid */}
          <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-3 md:gap-4 max-h-[500px] overflow-y-auto">
            {filteredMaterials.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setSelectedMaterialId(m.id);
                  setStep('result');
                }}
                className={`group relative overflow-hidden border-2 transition-all ${
                  selectedMaterialId === m.id ? 'border-stone-900' : 'border-transparent hover:border-stone-300'
                }`}
              >
                <LazyImage src={m.textureImage} alt={m.name} aspectClass="aspect-square" className="transition-transform duration-300 group-hover:scale-110" />
                <div className="absolute bottom-0 left-0 right-0 p-2 bg-stone-950/60">
                  <p className="text-white text-xs font-light truncate">{m.name}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 4: Result */}
      {step === 'result' && roomImage && selectedMaterial && (
        <div className="container-lux pb-20">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <button onClick={() => setStep('material')} className="flex items-center gap-2 text-xs tracking-[0.15em] uppercase text-stone-500 hover:text-stone-900">
              <ArrowLeft size={14} strokeWidth={1.5} className="rtl:rotate-180" />
              {t('changeMaterial')}
            </button>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setZoom(zoom === 1 ? 1.5 : 1)} className="flex items-center gap-1.5 text-xs tracking-wider uppercase border border-stone-300 px-3 py-2 hover:border-stone-900 transition-colors">
                <ZoomIn size={13} strokeWidth={1.5} /> {t('reset')}
              </button>
              <button onClick={() => { setStep('room'); setUploadedImage(null); setUploadMode(false); setSelectedMaterialId(null); }} className="flex items-center gap-1.5 text-xs tracking-wider uppercase border border-stone-300 px-3 py-2 hover:border-stone-900 transition-colors">
                <RotateCcw size={13} strokeWidth={1.5} /> {t('reset')}
              </button>
              <button onClick={() => setShowCompare(!showCompare)} className="flex items-center gap-1.5 text-xs tracking-wider uppercase border border-stone-300 px-3 py-2 hover:border-stone-900 transition-colors">
                {t('compare')}
              </button>
            </div>
          </div>

          {/* Visualizer Canvas */}
          <div className="relative aspect-[16/10] overflow-hidden bg-stone-200" style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}>
            <img src={roomImage} alt="Room" className="absolute inset-0 w-full h-full object-cover" />

            {/* Applied Material */}
            <div
              className="absolute inset-0 transition-all duration-500"
              style={{
                clipPath: applySurfaceClip(selectedSurfaceId || 'floor'),
                backgroundImage: `url(${selectedMaterial.textureImage})`,
                backgroundSize: showCompare && sliderPos < 50 ? '0% 0%' : 'cover',
                backgroundPosition: 'center',
                mixBlendMode: 'multiply',
                opacity: 0.85,
              }}
            />

            {/* Compare Slider */}
            {showCompare && (
              <>
                <div
                  className="absolute inset-0"
                  style={{
                    clipPath: `polygon(0 0, ${sliderPos}% 0, ${sliderPos}% 100%, 0 100%)`,
                    backgroundImage: `url(${compareMaterial?.textureImage || selectedMaterial.textureImage})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    mixBlendMode: 'multiply',
                    opacity: 0.85,
                  }}
                />
                <div
                  className="absolute top-0 bottom-0 w-px bg-white shadow-lg cursor-ew-resize"
                  style={{ left: `${sliderPos}%` }}
                >
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center">
                    <ChevronLeft size={14} strokeWidth={2} className="text-stone-900" />
                    <ChevronRight size={14} strokeWidth={2} className="text-stone-900" />
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sliderPos}
                  onChange={(e) => setSliderPos(Number(e.target.value))}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize"
                />
                <span className="absolute top-4 left-4 text-xs tracking-wider uppercase text-white bg-stone-950/60 px-3 py-1.5">{t('before')}</span>
                <span className="absolute top-4 right-4 text-xs tracking-wider uppercase text-white bg-stone-950/60 px-3 py-1.5">{t('after')}</span>
              </>
            )}

            {/* Labels */}
            {!showCompare && (
              <div className="absolute bottom-4 left-4 flex gap-2">
                <span className="text-xs tracking-wider uppercase text-white bg-stone-950/60 px-3 py-1.5">
                  {lang === 'ar' ? selectedSurface?.nameAr || selectedSurfaceId : selectedSurface?.name || selectedSurfaceId}
                </span>
              </div>
            )}
          </div>

          {/* Compare Material Selector */}
          {showCompare && (
            <div className="mt-4">
              <p className="text-xs tracking-[0.15em] uppercase text-stone-500 mb-3">{t('compare')} A / B</p>
              <div className="flex gap-3 overflow-x-auto scrollbar-hide">
                {materials.slice(0, 10).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setCompareMaterialId(m.id)}
                    className={`shrink-0 w-16 h-16 overflow-hidden border-2 ${compareMaterialId === m.id ? 'border-stone-900' : 'border-transparent'}`}
                  >
                    <img src={m.textureImage} alt={m.name} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Selected Material Panel */}
          <div className="mt-8 bg-ivory p-6 md:p-8 border border-stone-200">
            <div className="flex flex-col md:flex-row gap-6 items-start">
              <LazyImage src={selectedMaterial.textureImage} alt={selectedMaterial.name} aspectClass="w-24 h-24 shrink-0" />
              <div className="flex-1">
                <p className="text-xs tracking-[0.2em] uppercase text-stone-500 mb-1">{t('selectedMaterial')}</p>
                <h3 className="font-display text-2xl font-light text-stone-900 mb-2">{selectedMaterial.name}</h3>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-stone-600">
                  <span>{selectedMaterial.category}</span>
                  <span>· {selectedMaterial.colour}</span>
                  <span>· {selectedMaterial.finish}</span>
                  <span>· {selectedMaterial.sizes[0]}</span>
                </div>
              </div>
              <div className="flex flex-col gap-2 w-full md:w-auto">
                <button onClick={() => navigate(`/material/${selectedMaterial.slug}`)} className="btn-outline text-xs">
                  {t('viewDetails')}
                </button>
                <button onClick={() => navigate('/contact')} className="btn-primary text-xs">
                  {t('requestQuote')}
                </button>
              </div>
            </div>

            {/* Save / Share Actions */}
            <div className="flex flex-wrap gap-3 mt-6 pt-6 border-t border-stone-200">
              <button
                onClick={() => {
                  toggle(selectedMaterial.id);
                  setShowSaved(true);
                  setTimeout(() => setShowSaved(false), 2000);
                }}
                className="flex items-center gap-2 text-xs tracking-wider uppercase text-stone-600 hover:text-stone-900 transition-colors"
              >
                <Heart size={14} strokeWidth={1.5} fill={has(selectedMaterial.id) ? 'currentColor' : 'none'} className={has(selectedMaterial.id) ? 'text-accent' : ''} />
                {t('saveDesign')}
              </button>
              <button className="flex items-center gap-2 text-xs tracking-wider uppercase text-stone-600 hover:text-stone-900 transition-colors">
                <Download size={14} strokeWidth={1.5} />
                {t('downloadImage')}
              </button>
              <button className="flex items-center gap-2 text-xs tracking-wider uppercase text-stone-600 hover:text-stone-900 transition-colors">
                <Share2 size={14} strokeWidth={1.5} />
                {t('share')}
              </button>
            </div>
          </div>

          {showSaved && (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-stone-900 text-ivory px-6 py-3 text-sm tracking-wider z-50">
              {t('saveDesign')} ✓
            </div>
          )}
        </div>
      )}
    </div>
  );
}
