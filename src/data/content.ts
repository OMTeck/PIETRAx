import type { Project, Room, Collection } from './types';

export const collections: Collection[] = [
  {
    id: 'marble',
    name: 'Marble',
    nameAr: 'الرخام',
    image: 'https://images.pexels.com/photos/3847496/pexels-photo-3847496.jpeg?auto=compress&cs=tinysrgb&w=1600',
    description: 'Timeless natural stone',
  },
  {
    id: 'porcelain',
    name: 'Porcelain',
    nameAr: 'البورسلان',
    image: 'https://images.pexels.com/photos/3847490/pexels-photo-3847490.jpeg?auto=compress&cs=tinysrgb&w=1600',
    description: 'Large-format durability',
  },
  {
    id: 'ceramic',
    name: 'Ceramic',
    nameAr: 'السيراميك',
    image: 'https://images.pexels.com/photos/6903173/pexels-photo-6903173.jpeg?auto=compress&cs=tinysrgb&w=1600',
    description: 'Versatile and practical',
  },
  {
    id: 'travertine',
    name: 'Travertine',
    nameAr: 'الترافرتين',
    image: 'https://images.pexels.com/photos/4705853/pexels-photo-4705853.jpeg?auto=compress&cs=tinysrgb&w=1600',
    description: 'Warm and textured',
  },
  {
    id: 'onyx',
    name: 'Onyx',
    nameAr: 'الأونيكس',
    image: 'https://images.pexels.com/photos/4709469/pexels-photo-4709469.jpeg?auto=compress&cs=tinysrgb&w=1600',
    description: 'Translucent and luminous',
  },
  {
    id: 'granite',
    name: 'Granite',
    nameAr: 'الجرانيت',
    image: 'https://images.pexels.com/photos/7232911/pexels-photo-7232911.jpeg?auto=compress&cs=tinysrgb&w=1600',
    description: 'Hard and enduring',
  },
];

export const projects: Project[] = [
  {
    id: 'p01',
    title: 'Villa Serenity',
    slug: 'villa-serenity',
    location: 'Riyadh, Saudi Arabia',
    category: 'Residential',
    image: 'https://images.pexels.com/photos/28254550/pexels-photo-28254550.jpeg?auto=compress&cs=tinysrgb&w=1600',
    gallery: [
      'https://images.pexels.com/photos/28254550/pexels-photo-28254550.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/6580381/pexels-photo-6580381.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/6283967/pexels-photo-6283967.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ],
    materials: ['calacatta-gold', 'bianco-carrara'],
    description: 'A private residence featuring full-height marble walls and integrated lighting.',
  },
  {
    id: 'p02',
    title: 'The Grand Lobby',
    slug: 'the-grand-lobby',
    location: 'Dubai, UAE',
    category: 'Commercial',
    image: 'https://images.pexels.com/photos/14011664/pexels-photo-14011664.jpeg?auto=compress&cs=tinysrgb&w=1600',
    gallery: [
      'https://images.pexels.com/photos/14011664/pexels-photo-14011664.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/2869215/pexels-photo-2869215.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/8312027/pexels-photo-8312027.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ],
    materials: ['statuario-venato', 'nero-marquina'],
    description: 'A corporate headquarters lobby with bookmatched marble and brass details.',
  },
  {
    id: 'p03',
    title: 'Hotel Aurelia',
    slug: 'hotel-aurelia',
    location: 'Doha, Qatar',
    category: 'Hospitality',
    image: 'https://images.pexels.com/photos/2869215/pexels-photo-2869215.jpeg?auto=compress&cs=tinysrgb&w=1600',
    gallery: [
      'https://images.pexels.com/photos/2869215/pexels-photo-2869215.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/14036253/pexels-photo-14036253.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/19689235/pexels-photo-19689235.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ],
    materials: ['travertine-navona', 'calacatta-gold'],
    description: 'A five-star hotel with travertine floors and marble feature walls throughout.',
  },
  {
    id: 'p04',
    title: 'Marble Kitchen House',
    slug: 'marble-kitchen-house',
    location: 'Jeddah, Saudi Arabia',
    category: 'Kitchen',
    image: 'https://images.pexels.com/photos/8146212/pexels-photo-8146212.jpeg?auto=compress&cs=tinysrgb&w=1600',
    gallery: [
      'https://images.pexels.com/photos/8146212/pexels-photo-8146212.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/7535035/pexels-photo-7535035.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/35021550/pexels-photo-35021550.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ],
    materials: ['calacatta-gold', 'granite-bianco'],
    description: 'A chef\'s kitchen with waterfall marble island and matching backsplash.',
  },
  {
    id: 'p05',
    title: 'Spa Retreat',
    slug: 'spa-retreat',
    location: 'AlUla, Saudi Arabia',
    category: 'Bathroom',
    image: 'https://images.pexels.com/photos/6492399/pexels-photo-6492399.jpeg?auto=compress&cs=tinysrgb&w=1600',
    gallery: [
      'https://images.pexels.com/photos/6492399/pexels-photo-6492399.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/6587852/pexels-photo-6587852.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/33529508/pexels-photo-33529508.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ],
    materials: ['statuario-venato', 'bianco-carrara'],
    description: 'A private spa with floor-to-ceiling marble and a freestanding soaking tub.',
  },
  {
    id: 'p06',
    title: 'Stone Facade Residence',
    slug: 'stone-facade-residence',
    location: 'Riyadh, Saudi Arabia',
    category: 'Exterior',
    image: 'https://images.pexels.com/photos/11890079/pexels-photo-11890079.jpeg?auto=compress&cs=tinysrgb&w=1600',
    gallery: [
      'https://images.pexels.com/photos/11890079/pexels-photo-11890079.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/11182195/pexels-photo-11182195.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/33865563/pexels-photo-33865563.jpeg?auto=compress&cs=tinysrgb&w=1200',
    ],
    materials: ['travertine-navona', 'travertine-silver'],
    description: 'A residential facade clad in natural travertine with integrated landscape lighting.',
  },
];

export const rooms: Room[] = [
  {
    id: 'living-room',
    name: 'Living Room',
    nameAr: 'غرفة المعيشة',
    image: 'https://images.pexels.com/photos/28254550/pexels-photo-28254550.jpeg?auto=compress&cs=tinysrgb&w=1600',
    surfaces: [
      {
        id: 'floor',
        name: 'Floor',
        nameAr: 'الأرضية',
        clipPath: 'polygon(0 60%, 100% 60%, 100% 100%, 0 100%)',
        defaultMaterial: 'calacatta-gold',
      },
      {
        id: 'main-wall',
        name: 'Main Wall',
        nameAr: 'الجدار الرئيسي',
        clipPath: 'polygon(0 0, 100% 0, 100% 60%, 0 60%)',
        defaultMaterial: 'statuario-venato',
      },
    ],
  },
  {
    id: 'kitchen',
    name: 'Kitchen',
    nameAr: 'المطبخ',
    image: 'https://images.pexels.com/photos/8146212/pexels-photo-8146212.jpeg?auto=compress&cs=tinysrgb&w=1600',
    surfaces: [
      {
        id: 'countertop',
        name: 'Countertop',
        nameAr: 'الجزيرة',
        clipPath: 'polygon(0 45%, 100% 45%, 100% 65%, 0 65%)',
        defaultMaterial: 'calacatta-gold',
      },
      {
        id: 'backsplash',
        name: 'Backsplash',
        nameAr: 'الجدار الخلفي',
        clipPath: 'polygon(0 25%, 100% 25%, 100% 45%, 0 45%)',
        defaultMaterial: 'porcelain-calacatta',
      },
      {
        id: 'floor',
        name: 'Floor',
        nameAr: 'الأرضية',
        clipPath: 'polygon(0 65%, 100% 65%, 100% 100%, 0 100%)',
        defaultMaterial: 'porcelain-pietra',
      },
    ],
  },
  {
    id: 'bathroom',
    name: 'Bathroom',
    nameAr: 'الحمام',
    image: 'https://images.pexels.com/photos/6492399/pexels-photo-6492399.jpeg?auto=compress&cs=tinysrgb&w=1600',
    surfaces: [
      {
        id: 'wall',
        name: 'Bathroom Wall',
        nameAr: 'جدار الحمام',
        clipPath: 'polygon(0 0, 100% 0, 100% 65%, 0 65%)',
        defaultMaterial: 'statuario-venato',
      },
      {
        id: 'floor',
        name: 'Floor',
        nameAr: 'الأرضية',
        clipPath: 'polygon(0 65%, 100% 65%, 100% 100%, 0 100%)',
        defaultMaterial: 'bianco-carrara',
      },
    ],
  },
  {
    id: 'bedroom',
    name: 'Bedroom',
    nameAr: 'غرفة النوم',
    image: 'https://images.pexels.com/photos/6585757/pexels-photo-6585757.jpeg?auto=compress&cs=tinysrgb&w=1600',
    surfaces: [
      {
        id: 'feature-wall',
        name: 'Feature Wall',
        nameAr: 'الجدار المميز',
        clipPath: 'polygon(0 0, 100% 0, 100% 55%, 0 55%)',
        defaultMaterial: 'travertine-navona',
      },
      {
        id: 'floor',
        name: 'Floor',
        nameAr: 'الأرضية',
        clipPath: 'polygon(0 55%, 100% 55%, 100% 100%, 0 100%)',
        defaultMaterial: 'ceramic-sahara',
      },
    ],
  },
  {
    id: 'hotel-lobby',
    name: 'Hotel Lobby',
    nameAr: 'بهو الفندق',
    image: 'https://images.pexels.com/photos/14011664/pexels-photo-14011664.jpeg?auto=compress&cs=tinysrgb&w=1600',
    surfaces: [
      {
        id: 'floor',
        name: 'Floor',
        nameAr: 'الأرضية',
        clipPath: 'polygon(0 50%, 100% 50%, 100% 100%, 0 100%)',
        defaultMaterial: 'statuario-venato',
      },
      {
        id: 'main-wall',
        name: 'Main Wall',
        nameAr: 'الجدار الرئيسي',
        clipPath: 'polygon(0 0, 100% 0, 100% 50%, 0 50%)',
        defaultMaterial: 'nero-marquina',
      },
    ],
  },
  {
    id: 'office',
    name: 'Office',
    nameAr: 'المكتب',
    image: 'https://images.pexels.com/photos/7534185/pexels-photo-7534185.jpeg?auto=compress&cs=tinysrgb&w=1600',
    surfaces: [
      {
        id: 'floor',
        name: 'Floor',
        nameAr: 'الأرضية',
        clipPath: 'polygon(0 55%, 100% 55%, 100% 100%, 0 100%)',
        defaultMaterial: 'porcelain-pietra',
      },
      {
        id: 'main-wall',
        name: 'Main Wall',
        nameAr: 'الجدار الرئيسي',
        clipPath: 'polygon(0 0, 100% 0, 100% 55%, 0 55%)',
        defaultMaterial: 'travertine-silver',
      },
    ],
  },
  {
    id: 'outdoor',
    name: 'Outdoor Area',
    nameAr: 'المنطقة الخارجية',
    image: 'https://images.pexels.com/photos/17086150/pexels-photo-17086150.jpeg?auto=compress&cs=tinysrgb&w=1600',
    surfaces: [
      {
        id: 'floor',
        name: 'Floor',
        nameAr: 'الأرضية',
        clipPath: 'polygon(0 50%, 100% 50%, 100% 100%, 0 100%)',
        defaultMaterial: 'travertine-silver',
      },
    ],
  },
];

export const colourSwatches: Record<string, string> = {
  White: 'https://images.pexels.com/photos/3847496/pexels-photo-3847496.jpeg?auto=compress&cs=tinysrgb&w=600',
  Beige: 'https://images.pexels.com/photos/4705853/pexels-photo-4705853.jpeg?auto=compress&cs=tinysrgb&w=600',
  Grey: 'https://images.pexels.com/photos/3847498/pexels-photo-3847498.jpeg?auto=compress&cs=tinysrgb&w=600',
  Black: 'https://images.pexels.com/photos/36327398/pexels-photo-36327398.jpeg?auto=compress&cs=tinysrgb&w=600',
  Brown: 'https://images.pexels.com/photos/36022184/pexels-photo-36022184.jpeg?auto=compress&cs=tinysrgb&w=600',
  Green: 'https://images.pexels.com/photos/28288788/pexels-photo-28288788.jpeg?auto=compress&cs=tinysrgb&w=600',
  Blue: 'https://images.pexels.com/photos/11274968/pexels-photo-11274968.jpeg?auto=compress&cs=tinysrgb&w=600',
  Multicolor: 'https://images.pexels.com/photos/4709405/pexels-photo-4709405.jpeg?auto=compress&cs=tinysrgb&w=600',
};

export const showroomImage = 'https://images.pexels.com/photos/5827062/pexels-photo-5827062.jpeg?auto=compress&cs=tinysrgb&w=1600';
export const heroImage = 'https://images.pexels.com/photos/16199071/pexels-photo-16199071.jpeg?auto=compress&cs=tinysrgb&w=1920';
