export type MaterialType = 'Marble' | 'Ceramic' | 'Porcelain' | 'Granite' | 'Travertine' | 'Onyx';
export type Colour = 'White' | 'Beige' | 'Grey' | 'Black' | 'Brown' | 'Green' | 'Blue' | 'Multicolor';
export type Application = 'Floor' | 'Wall' | 'Kitchen' | 'Bathroom' | 'Outdoor' | 'Countertop';
export type Finish = 'Polished' | 'Honed' | 'Matt' | 'Glossy' | 'Textured';

export interface Material {
  id: string;
  name: string;
  slug: string;
  category: MaterialType;
  colour: Colour;
  origin: string;
  finish: Finish;
  sizes: string[];
  thickness: string;
  applications: Application[];
  description: string;
  textureImage: string;
  slabImage: string;
  roomImages: string[];
  gallery: string[];
  availability: boolean;
  featured: boolean;
  newArrival: boolean;
  popular: boolean;
  bookmatch?: boolean;
}

export interface Project {
  id: string;
  title: string;
  slug: string;
  location: string;
  category: 'Residential' | 'Commercial' | 'Hospitality' | 'Kitchen' | 'Bathroom' | 'Exterior';
  image: string;
  gallery: string[];
  materials: string[];
  description: string;
}

export interface Room {
  id: string;
  name: string;
  nameAr: string;
  image: string;
  surfaces: RoomSurface[];
}

export interface RoomSurface {
  id: string;
  name: string;
  nameAr: string;
  clipPath: string;
  defaultMaterial?: string;
}

export interface Collection {
  id: string;
  name: string;
  nameAr: string;
  image: string;
  description: string;
}
