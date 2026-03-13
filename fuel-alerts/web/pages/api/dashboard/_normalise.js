export const BRAND_CASE = `
  CASE
    WHEN brand_name ILIKE '%tesco%' THEN 'TESCO'
    WHEN brand_name ILIKE '%asda%' THEN 'ASDA'
    WHEN brand_name ILIKE '%sainsbury%' THEN 'SAINSBURYS'
    WHEN brand_name ILIKE '%morrisons%' THEN 'MORRISONS'
    WHEN brand_name ILIKE '%costco%' THEN 'COSTCO'
    WHEN brand_name ILIKE '%shell%' THEN 'SHELL'
    WHEN brand_name ILIKE '%bp%' OR brand_name = 'B P' THEN 'BP'
    WHEN brand_name ILIKE '%esso%' THEN 'ESSO'
    WHEN brand_name ILIKE '%texaco%' THEN 'TEXACO'
    WHEN brand_name ILIKE '%gulf%' THEN 'GULF'
    WHEN brand_name ILIKE '%jet%' THEN 'JET'
    WHEN brand_name ILIKE '%murco%' THEN 'MURCO'
    WHEN brand_name ILIKE '%circle k%' THEN 'CIRCLE K'
    WHEN brand_name ILIKE '%maxol%' THEN 'MAXOL'
    WHEN brand_name ILIKE '%harvest%' THEN 'HARVEST ENERGY'
    WHEN brand_name ILIKE '%total%' THEN 'TOTAL'
    ELSE 'OTHER'
  END
`

export const SUPERMARKET_BRANDS = ['TESCO', 'ASDA', 'SAINSBURYS', 'MORRISONS', 'COSTCO']
