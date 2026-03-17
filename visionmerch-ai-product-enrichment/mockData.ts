
import { Product, CharacteristicType, CharacteristicValue, CategoryTemplate } from './types';

const BRANDS = ['Nike', 'Adidas', 'Puma', 'Lululemon', 'Zara', 'Levi\'s'];
const DEPTS = ['Men\'s', 'Women\'s', 'Kids', 'Accessories'];
const CLASSES = ['Tops', 'Bottoms', 'Dresses', 'Outerwear', 'Footwear'];

export const generateMockProducts = (count: number): Product[] => {
  return Array.from({ length: count }, (_, i) => {
    const style_id = (1000000 + i).toString();
    const dept = DEPTS[i % DEPTS.length];
    const cat = CLASSES[i % CLASSES.length];
    
    const product: Product = {
      business_unit_id: 1,
      style_id,
      color_id: '00' + (i % 9 + 1),
      image_id: 3000 + i,
      thumbnail_base64: `https://picsum.photos/seed/${style_id}/128/128`,
      original_name: `${style_id}_001.jpg`,
      group_id: '504',
      product_category: 'Apparel',
      dept_id: '52' + (i % 5),
      department: dept,
      class_id: '521' + (i % 5),
      category: cat,
      sub_class_id: '52111',
      sub_category: 'Standard ' + cat,
      brand_id: BRANDS[i % BRANDS.length].toUpperCase(),
      brand: BRANDS[i % BRANDS.length],
      style_desc: `${BRANDS[i % BRANDS.length]} ${cat.slice(0, -1)}`,
      color_desc: i % 2 === 0 ? 'Midnight Blue' : 'Classic White',
      long_style_desc: '',
      short_style_desc: '',
      color_ai_desc: '',
      additional_attributes: '',
      vendor_composition: '95% Cotton, 5% Elastane',
      vendor_care: 'Machine wash cold, tumble dry low',
      vendor_origin: 'Made in Portugal',
      last_sync_timestamp: i % 3 === 0 ? '2024-05-15 09:45:00' : undefined,
      sty_char1: i % 5 === 0 ? 'Material : Cotton' : '',
      sty_char2: i % 3 === 0 ? 'Neckline : Crew' : '',
    };

    // Initialize all sty_char fields
    for (let j = 1; j <= 25; j++) {
      const key = `sty_char${j}`;
      if (!(product as any)[key]) (product as any)[key] = '';
    }

    return product;
  });
};

export const mockCharTypes: CharacteristicType[] = [
  { business_unit_id: 1, characteristic_type_id: "MAT01", description: "Material", sub_type: "STYL" },
  { business_unit_id: 1, characteristic_type_id: "NCK01", description: "Neckline", sub_type: "STYL" },
  { business_unit_id: 1, characteristic_type_id: "PTN01", description: "Pattern", sub_type: "STYL" },
  { business_unit_id: 1, characteristic_type_id: "FIT01", description: "Fit", sub_type: "STYL" },
  { business_unit_id: 1, characteristic_type_id: "SLV01", description: "Sleeve Length", sub_type: "STYL" },
  { business_unit_id: 1, characteristic_type_id: "OCC01", description: "Occasion", sub_type: "STYL" },
  { business_unit_id: 1, characteristic_type_id: "SHP01", description: "Shoe Style", sub_type: "STYL" },
  { business_unit_id: 1, characteristic_type_id: "HEL01", description: "Heel Height", sub_type: "STYL" },
  { business_unit_id: 1, characteristic_type_id: "SIL01", description: "Silhouette", sub_type: "STYL" },
];

export const mockCharValues: Record<string, CharacteristicValue[]> = {
  "MAT01": [
    { business_unit_id: 1, characteristic_type_id: "MAT01", characteristic_value_id: "COT01", description: "Cotton" },
    { business_unit_id: 1, characteristic_type_id: "MAT01", characteristic_value_id: "PLY01", description: "Polyester" },
    { business_unit_id: 1, characteristic_type_id: "MAT01", characteristic_value_id: "SLK01", description: "Silk" },
  ],
  "NCK01": [
    { business_unit_id: 1, characteristic_type_id: "NCK01", characteristic_value_id: "CRW01", description: "Crew" },
    { business_unit_id: 1, characteristic_type_id: "NCK01", characteristic_value_id: "VNK01", description: "V-Neck" },
  ],
  "PTN01": [
    { business_unit_id: 1, characteristic_type_id: "PTN01", characteristic_value_id: "SOL01", description: "Solid" },
    { business_unit_id: 1, characteristic_type_id: "PTN01", characteristic_value_id: "STR01", description: "Striped" },
  ]
};

export const mockTemplates: CategoryTemplate[] = [
  {
    id: 'tmpl-1',
    name: 'Dresses Standard',
    target_category: 'Dresses',
    characteristic_type_ids: ['SIL01', 'NCK01', 'SLV01', 'MAT01']
  },
  {
    id: 'tmpl-2',
    name: 'Footwear Basic',
    target_category: 'Footwear',
    characteristic_type_ids: ['SHP01', 'HEL01', 'MAT01', 'OCC01']
  },
  {
    id: 'tmpl-3',
    name: 'Tops Collection',
    target_category: 'Tops',
    characteristic_type_ids: ['NCK01', 'SLV01', 'FIT01', 'MAT01', 'PTN01']
  }
];
