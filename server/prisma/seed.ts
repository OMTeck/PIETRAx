import { Lang, ImageKind, MaterialStatus, ProjectStatus, SurfaceType, RoomType, Prisma } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { prisma } from '../src/db.js';
import { materials as SITE_MATERIALS } from '../../src/data/materials.js';
import {
  collections as SITE_COLLECTIONS,
  projects as SITE_PROJECTS,
  rooms as SITE_ROOMS,
  colourSwatches,
  heroImage,
  showroomImage,
} from '../../src/data/content.js';
import { DEFAULT_SETTINGS } from '../src/routes/admin/content.js';

type Delegate = any; // eslint-disable-line @typescript-eslint/no-explicit-any

async function upsertRow(
  delegate: Delegate,
  where: Record<string, unknown>,
  data: Record<string, unknown>,
): Promise<string> {
  const existing: { id: string } | null = await delegate.findUnique({ where });
  if (existing) {
    await delegate.update({ where, data });
    return existing.id;
  }
  const created: { id: string } = await delegate.create({ data });
  return created.id;
}

function sizeCode(label: string): string {
  return label.replace(/×/g, 'x').toLowerCase().trim();
}

async function main(): Promise<void> {
  // -------------------------------------------------------------------------
  // Admin owner
  // -------------------------------------------------------------------------
  const ownerEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@pietra.dev';
  const ownerPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123456';
  const passwordHash = await hash(ownerPassword);
  const owner = await prisma.adminUser.upsert({
    where: { email: ownerEmail },
    create: {
      email: ownerEmail,
      name: 'Owner',
      passwordHash,
      role: 'OWNER',
      status: 'ACTIVE',
      mfaEnabled: false,
      passwordChangedAt: new Date(),
    },
    update: {},
  });
  if (!owner.passwordHash) {
    await prisma.adminUser.update({ where: { id: owner.id }, data: { passwordHash } });
  }

  // -------------------------------------------------------------------------
  // Taxonomy
  // -------------------------------------------------------------------------
  const materialTypes: Array<{ code: string; labelAr: string; labelEn: string }> = [
    { code: 'marble', labelAr: 'الرخام', labelEn: 'Marble' },
    { code: 'ceramic', labelAr: 'السيراميك', labelEn: 'Ceramic' },
    { code: 'porcelain', labelAr: 'البورسلان', labelEn: 'Porcelain' },
    { code: 'granite', labelAr: 'الجرانيت', labelEn: 'Granite' },
    { code: 'travertine', labelAr: 'الترافرتين', labelEn: 'Travertine' },
    { code: 'onyx', labelAr: 'الأونيكس', labelEn: 'Onyx' },
  ];
  const typeId: Record<string, string> = {};
  let i = 0;
  for (const t of materialTypes) {
    typeId[t.code] = await upsertRow(
      prisma.materialType,
      { code: t.code },
      { code: t.code, slug: t.code, labelAr: t.labelAr, labelEn: t.labelEn, sortOrder: i++, system: true },
    );
  }

  const categoryIdMap: Record<string, string> = {};
  i = 0;
  for (const c of SITE_COLLECTIONS) {
    categoryIdMap[c.id.toLowerCase()] = await upsertRow(
      prisma.category,
      { slug: c.id },
      {
        code: c.id,
        slug: c.id,
        labelAr: c.nameAr,
        labelEn: c.name,
        descriptionAr: c.description,
        descriptionEn: c.description,
        coverImage: c.image,
        sortOrder: i++,
        system: true,
      },
    );
  }

  const colors: Array<{ code: string; labelAr: string; labelEn: string }> = [
    { code: 'white', labelAr: 'أبيض', labelEn: 'White' },
    { code: 'beige', labelAr: 'بيج', labelEn: 'Beige' },
    { code: 'grey', labelAr: 'رمادي', labelEn: 'Grey' },
    { code: 'black', labelAr: 'أسود', labelEn: 'Black' },
    { code: 'brown', labelAr: 'بني', labelEn: 'Brown' },
    { code: 'green', labelAr: 'أخضر', labelEn: 'Green' },
    { code: 'blue', labelAr: 'أزرق', labelEn: 'Blue' },
    { code: 'multicolor', labelAr: 'متعدد الألوان', labelEn: 'Multicolor' },
  ];
  const colorId: Record<string, string> = {};
  i = 0;
  for (const c of colors) {
    colorId[c.code] = await upsertRow(
      prisma.color,
      { code: c.code },
      { code: c.code, labelAr: c.labelAr, labelEn: c.labelEn, swatchImage: colourSwatches[c.labelEn] ?? null, sortOrder: i++, system: true },
    );
  }

  const finishes: Array<{ code: string; labelAr: string; labelEn: string }> = [
    { code: 'polished', labelAr: 'مصقول', labelEn: 'Polished' },
    { code: 'honed', labelAr: 'غير مصقول', labelEn: 'Honed' },
    { code: 'matt', labelAr: 'ماتي', labelEn: 'Matt' },
    { code: 'glossy', labelAr: 'لامع', labelEn: 'Glossy' },
    { code: 'textured', labelAr: 'محبّب', labelEn: 'Textured' },
  ];
  const finishId: Record<string, string> = {};
  i = 0;
  for (const f of finishes) {
    finishId[f.code] = await upsertRow(
      prisma.finish,
      { code: f.code },
      { code: f.code, labelAr: f.labelAr, labelEn: f.labelEn, sortOrder: i++, system: true },
    );
  }

  const sizes: Array<{ code: string; label: string }> = [
    { code: 'slab', label: 'Slab' },
    { code: '60x60', label: '60×60' },
    { code: '60x120', label: '60×120' },
    { code: '120x120', label: '120×120' },
    { code: '120x240', label: '120×240' },
  ];
  const sizeId: Record<string, string> = {};
  i = 0;
  for (const s of sizes) {
    sizeId[s.code] = await upsertRow(prisma.size, { code: s.code }, { code: s.code, label: s.label, sortOrder: i++, system: true });
  }

  const applications: Array<{ code: string; labelAr: string; labelEn: string }> = [
    { code: 'floor', labelAr: 'أرضية', labelEn: 'Floor' },
    { code: 'wall', labelAr: 'جدار', labelEn: 'Wall' },
    { code: 'kitchen', labelAr: 'مطبخ', labelEn: 'Kitchen' },
    { code: 'bathroom', labelAr: 'حمام', labelEn: 'Bathroom' },
    { code: 'outdoor', labelAr: 'خارجي', labelEn: 'Outdoor' },
    { code: 'countertop', labelAr: 'جزيرة', labelEn: 'Countertop' },
  ];
  const applicationId: Record<string, string> = {};
  i = 0;
  for (const a of applications) {
    applicationId[a.code] = await upsertRow(
      prisma.application,
      { code: a.code },
      { code: a.code, labelAr: a.labelAr, labelEn: a.labelEn, sortOrder: i++, system: true },
    );
  }

  const projectTypes: Array<{ code: string; labelAr: string; labelEn: string }> = [
    { code: 'residential', labelAr: 'سكني', labelEn: 'Residential' },
    { code: 'commercial', labelAr: 'تجاري', labelEn: 'Commercial' },
    { code: 'hospitality', labelAr: 'فندقي', labelEn: 'Hospitality' },
    { code: 'kitchen', labelAr: 'مطبخ', labelEn: 'Kitchen' },
    { code: 'bathroom', labelAr: 'حمام', labelEn: 'Bathroom' },
    { code: 'exterior', labelAr: 'واجهات', labelEn: 'Exterior' },
  ];
  const projectTypeId: Record<string, string> = {};
  i = 0;
  for (const p of projectTypes) {
    projectTypeId[p.code] = await upsertRow(
      prisma.projectType,
      { code: p.code },
      { code: p.code, labelAr: p.labelAr, labelEn: p.labelEn, sortOrder: i++, system: true },
    );
  }

  // -------------------------------------------------------------------------
  // Materials
  // -------------------------------------------------------------------------
  for (const site of SITE_MATERIALS) {
    const typeCode = site.category.toLowerCase();
    const type = typeId[typeCode];
    const color = colorId[site.colour.toLowerCase()];
    const finish = finishId[site.finish.toLowerCase()];
    if (!type) throw new Error(`Unknown material type code: ${typeCode}`);

    const technicalSpecs: Prisma.InputJsonValue = {
      origin: site.origin,
      thickness: site.thickness,
      finish: site.finish,
      applications: site.applications,
      typicalSizes: site.sizes,
    };

    const material = await prisma.material.upsert({
      where: { slug: site.slug },
      create: {
        slug: site.slug,
        materialTypeId: type,
        categoryId: categoryIdMap[typeCode] ?? null,
        colorId: color ?? null,
        finishId: finish ?? null,
        origin: site.origin,
        thickness: site.thickness,
        availability: site.availability,
        featured: site.featured,
        newArrival: site.newArrival,
        popular: site.popular,
        bookmatch: site.bookmatch ?? false,
        technicalSpecs,
        status: MaterialStatus.PUBLISHED,
        translations: {
          create: [
            {
              lang: Lang.EN,
              name: site.name,
              shortDescription: site.description,
              longDescription: site.description,
            },
            {
              lang: Lang.AR,
              name: site.name,
              shortDescription: site.description,
              longDescription: site.description,
            },
          ],
        },
      },
      update: {
        materialTypeId: type,
        categoryId: categoryIdMap[typeCode] ?? null,
        colorId: color ?? null,
        finishId: finish ?? null,
        origin: site.origin,
        thickness: site.thickness,
        availability: site.availability,
        featured: site.featured,
        newArrival: site.newArrival,
        popular: site.popular,
        bookmatch: site.bookmatch ?? false,
        technicalSpecs,
      },
    });

    const imageRows: Prisma.MaterialImageCreateManyInput[] = [
      { materialId: material.id, kind: ImageKind.TEXTURE, url: site.textureImage, altEn: site.name, sortOrder: 0 },
      { materialId: material.id, kind: ImageKind.SLAB, url: site.slabImage, altEn: site.name, sortOrder: 1 },
      ...site.roomImages.map((url, idx) => ({
        materialId: material.id,
        kind: ImageKind.ROOM,
        url,
        altEn: site.name,
        sortOrder: 10 + idx,
      })),
      ...site.gallery.map((url, idx) => ({
        materialId: material.id,
        kind: ImageKind.GALLERY,
        url,
        altEn: site.name,
        sortOrder: 100 + idx,
      })),
    ];
    await prisma.materialImage.deleteMany({ where: { materialId: material.id } });
    await prisma.materialImage.createMany({ data: imageRows });

    const sizeRows: Prisma.MaterialSizeCreateManyInput[] = site.sizes
      .map((label) => {
        const sid = sizeId[sizeCode(label)];
        return sid ? { materialId: material.id, sizeId: sid } : null;
      })
      .filter((r): r is Prisma.MaterialSizeCreateManyInput => r !== null);
    await prisma.materialSize.deleteMany({ where: { materialId: material.id } });
    await prisma.materialSize.createMany({ data: sizeRows });

    const applicationRows: Prisma.MaterialApplicationCreateManyInput[] = site.applications
      .map((app) => {
        const aid = applicationId[app.toLowerCase()];
        return aid ? { materialId: material.id, applicationId: aid } : null;
      })
      .filter((r): r is Prisma.MaterialApplicationCreateManyInput => r !== null);
    await prisma.materialApplication.deleteMany({ where: { materialId: material.id } });
    await prisma.materialApplication.createMany({ data: applicationRows });
  }

  // -------------------------------------------------------------------------
  // Collections
  // -------------------------------------------------------------------------
  const materialBySlug = await prisma.material.findMany({ select: { id: true, slug: true, materialTypeId: true } });
  const typeByMaterialId = new Map(materialBySlug.map((m) => [m.id, m.materialTypeId]));
  for (const site of SITE_COLLECTIONS) {
    const type = typeId[site.id.toLowerCase()];
    const collection = await prisma.collection.upsert({
      where: { slug: site.id },
      create: {
        slug: site.id,
        coverImage: site.image,
        featured: true,
        status: MaterialStatus.PUBLISHED,
        translations: {
          create: [
            { lang: Lang.EN, name: site.name, description: site.description },
            { lang: Lang.AR, name: site.nameAr, description: site.description },
          ],
        },
      },
      update: { coverImage: site.image },
    });
    const memberIds = materialBySlug.filter((m) => typeByMaterialId.get(m.id) === type).map((m) => m.id);
    await prisma.collectionItem.deleteMany({ where: { collectionId: collection.id } });
    if (memberIds.length > 0) {
      await prisma.collectionItem.createMany({ data: memberIds.map((materialId) => ({ collectionId: collection.id, materialId })) });
    }
  }

  // -------------------------------------------------------------------------
  // Projects
  // -------------------------------------------------------------------------
  for (const site of SITE_PROJECTS) {
    const ptype = projectTypeId[site.category.toLowerCase()];
    if (!ptype) throw new Error(`Unknown project type code: ${site.category.toLowerCase()}`);
    const project = await prisma.project.upsert({
      where: { slug: site.slug },
      create: {
        slug: site.slug,
        projectTypeId: ptype,
        location: site.location,
        coverImage: site.image,
        featured: true,
        status: ProjectStatus.PUBLISHED,
        translations: {
          create: [
            { lang: Lang.EN, title: site.title, shortDescription: site.description },
            { lang: Lang.AR, title: site.title, shortDescription: site.description },
          ],
        },
      },
      update: { projectTypeId: ptype, location: site.location, coverImage: site.image },
    });

    await prisma.projectImage.deleteMany({ where: { projectId: project.id } });
    await prisma.projectImage.createMany({
      data: site.gallery.map((url, idx) => ({ projectId: project.id, url, altEn: site.title, sortOrder: idx })),
    });

    const linked = materialBySlug
      .filter((m) => site.materials.includes(m.slug))
      .map((m) => ({ projectId: project.id, materialId: m.id }));
    await prisma.projectMaterial.deleteMany({ where: { projectId: project.id } });
    if (linked.length > 0) {
      await prisma.projectMaterial.createMany({ data: linked });
    }
  }

  // -------------------------------------------------------------------------
  // Room visualizer
  // -------------------------------------------------------------------------
  const roomTypeMap: Record<string, RoomType> = {
    'living-room': RoomType.LIVING_ROOM,
    kitchen: RoomType.KITCHEN,
    bathroom: RoomType.BATHROOM,
    bedroom: RoomType.BEDROOM,
    'hotel-lobby': RoomType.HOTEL_LOBBY,
    office: RoomType.OFFICE,
    outdoor: RoomType.OUTDOOR,
  };
  const surfaceTypeMap: Record<string, SurfaceType> = {
    floor: SurfaceType.FLOOR,
    'main-wall': SurfaceType.WALL,
    wall: SurfaceType.WALL,
    'feature-wall': SurfaceType.FEATURE_WALL,
    countertop: SurfaceType.COUNTERTOP,
    backsplash: SurfaceType.BACKSPLASH,
  };
  const materialIdBySlug = new Map(materialBySlug.map((m) => [m.slug, m.id]));

  for (const site of SITE_ROOMS) {
    const roomType = roomTypeMap[site.id];
    if (!roomType) throw new Error(`Unknown room type: ${site.id}`);
    const room = await prisma.visualizerRoom.upsert({
      where: { slug: site.id },
      create: {
        slug: site.id,
        roomType,
        nameEn: site.name,
        nameAr: site.nameAr,
        previewImage: site.image,
        fullImage: site.image,
        enabled: true,
        surfaces: {
          create: site.surfaces.map((s, idx) => {
            const st = surfaceTypeMap[s.id];
            if (!st) throw new Error(`Unknown surface type: ${s.id}`);
            return {
              surfaceType: st,
              nameEn: s.name,
              nameAr: s.nameAr,
              clipPath: s.clipPath,
              enabled: true,
              sortOrder: idx,
              defaultMaterialId: s.defaultMaterial ? (materialIdBySlug.get(s.defaultMaterial) ?? null) : null,
            };
          }),
        },
      },
      update: {
        roomType,
        nameEn: site.name,
        nameAr: site.nameAr,
        previewImage: site.image,
        fullImage: site.image,
      },
    });

    await prisma.visualizerSurface.deleteMany({ where: { roomId: room.id } });
    await prisma.visualizerSurface.createMany({
      data: site.surfaces.map((s, idx) => {
        const st = surfaceTypeMap[s.id];
        if (!st) throw new Error(`Unknown surface type: ${s.id}`);
        return {
          roomId: room.id,
          surfaceType: st,
          nameEn: s.name,
          nameAr: s.nameAr,
          clipPath: s.clipPath,
          enabled: true,
          sortOrder: idx,
          defaultMaterialId: s.defaultMaterial ? (materialIdBySlug.get(s.defaultMaterial) ?? null) : null,
        };
      }),
    });
  }

  for (const m of materialBySlug) {
    const site = SITE_MATERIALS.find((s) => s.slug === m.slug);
    await prisma.visualizerMaterialConfig.upsert({
      where: { materialId: m.id },
      create: {
        materialId: m.id,
        enabled: true,
        textureUrl: site?.textureImage ?? null,
        groutWidth: 4,
        bookmatch: site?.bookmatch ?? false,
      },
      update: { enabled: true, textureUrl: site?.textureImage ?? null, bookmatch: site?.bookmatch ?? false },
    });
  }

  // -------------------------------------------------------------------------
  // Site settings
  // -------------------------------------------------------------------------
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    let stored = value as Prisma.InputJsonValue;
    if (key === 'homepage' && typeof value === 'object' && value !== null) {
      const homepage = value as Record<string, unknown>;
      if (homepage.hero && typeof homepage.hero === 'object') {
        const hero = homepage.hero as Record<string, unknown>;
        stored = {
          ...(value as object),
          hero: { ...hero, image: heroImage },
          visualizerPromo: {
            ...((homepage.visualizerPromo as Record<string, unknown>) ?? {}),
            image: heroImage,
          },
        } as Prisma.InputJsonValue;
      }
    }
    if (key === 'showroom' && typeof value === 'object' && value !== null) {
      stored = { ...(value as object), image: showroomImage } as Prisma.InputJsonValue;
    }
    await prisma.siteSetting.upsert({
      where: { key },
      create: { key, value: stored, updatedById: owner.id },
      update: { value: stored, updatedById: owner.id },
    });
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  const [mats, colls, projs, rooms, msgs, quotes, bookings] = await Promise.all([
    prisma.material.count(),
    prisma.collection.count(),
    prisma.project.count(),
    prisma.visualizerRoom.count(),
    prisma.contactMessage.count(),
    prisma.quoteRequest.count(),
    prisma.showroomBooking.count(),
  ]);

  console.log('Seed complete:');
  console.log(`  Admin owner: ${ownerEmail} (role=OWNER, status=ACTIVE, password=${ownerPassword})`);
  console.log(`  Materials: ${mats} | Collections: ${colls} | Projects: ${projs} | Visualizer rooms: ${rooms}`);
  console.log(`  Contact messages: ${msgs} | Quotes: ${quotes} | Bookings: ${bookings}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });