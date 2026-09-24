// Nashville-metro ZIP centroids (approximate) and fictional demo dealerships.
// Production ZIP data should come from a GeoNames import (credited on the
// data-sources page).

export interface ZipRow {
  zip: string;
  city: string;
  lat: number;
  lng: number;
}

export const ZIPS: ZipRow[] = [
  { zip: "37201", city: "Nashville", lat: 36.1656, lng: -86.7784 },
  { zip: "37203", city: "Nashville", lat: 36.1503, lng: -86.7916 },
  { zip: "37204", city: "Nashville", lat: 36.1066, lng: -86.7747 },
  { zip: "37205", city: "Nashville", lat: 36.1115, lng: -86.869 },
  { zip: "37206", city: "Nashville", lat: 36.1797, lng: -86.7342 },
  { zip: "37207", city: "Nashville", lat: 36.231, lng: -86.764 },
  { zip: "37208", city: "Nashville", lat: 36.1768, lng: -86.8077 },
  { zip: "37209", city: "Nashville", lat: 36.1464, lng: -86.8984 },
  { zip: "37210", city: "Nashville", lat: 36.1377, lng: -86.7412 },
  { zip: "37211", city: "Nashville", lat: 36.0676, lng: -86.7231 },
  { zip: "37212", city: "Nashville", lat: 36.1338, lng: -86.8005 },
  { zip: "37213", city: "Nashville", lat: 36.1665, lng: -86.7669 },
  { zip: "37214", city: "Nashville", lat: 36.1656, lng: -86.6605 },
  { zip: "37215", city: "Nashville", lat: 36.0822, lng: -86.8318 },
  { zip: "37216", city: "Nashville", lat: 36.214, lng: -86.7255 },
  { zip: "37217", city: "Nashville", lat: 36.1085, lng: -86.6556 },
  { zip: "37218", city: "Nashville", lat: 36.2073, lng: -86.8468 },
  { zip: "37219", city: "Nashville", lat: 36.1672, lng: -86.7832 },
  { zip: "37220", city: "Nashville", lat: 36.0657, lng: -86.7688 },
  { zip: "37221", city: "Nashville", lat: 36.0728, lng: -86.954 },
  { zip: "37013", city: "Antioch", lat: 36.0467, lng: -86.6388 },
  { zip: "37015", city: "Ashland City", lat: 36.2768, lng: -87.0636 },
  { zip: "37027", city: "Brentwood", lat: 36.0056, lng: -86.7911 },
  { zip: "37062", city: "Fairview", lat: 35.9695, lng: -87.1286 },
  { zip: "37064", city: "Franklin", lat: 35.887, lng: -86.9187 },
  { zip: "37066", city: "Gallatin", lat: 36.3931, lng: -86.4453 },
  { zip: "37067", city: "Franklin", lat: 35.9139, lng: -86.778 },
  { zip: "37069", city: "Franklin", lat: 35.9829, lng: -86.9004 },
  { zip: "37072", city: "Goodlettsville", lat: 36.3562, lng: -86.7443 },
  { zip: "37075", city: "Hendersonville", lat: 36.3048, lng: -86.62 },
  { zip: "37076", city: "Hermitage", lat: 36.186, lng: -86.6 },
  { zip: "37080", city: "Joelton", lat: 36.3264, lng: -86.9038 },
  { zip: "37086", city: "La Vergne", lat: 36.0199, lng: -86.5588 },
  { zip: "37087", city: "Lebanon", lat: 36.2081, lng: -86.2911 },
  { zip: "37115", city: "Madison", lat: 36.2595, lng: -86.7016 },
  { zip: "37122", city: "Mount Juliet", lat: 36.1848, lng: -86.4997 },
  { zip: "37128", city: "Murfreesboro", lat: 35.8021, lng: -86.4535 },
  { zip: "37129", city: "Murfreesboro", lat: 35.9046, lng: -86.4545 },
  { zip: "37130", city: "Murfreesboro", lat: 35.8662, lng: -86.3783 },
  { zip: "37135", city: "Nolensville", lat: 35.9322, lng: -86.6817 },
  { zip: "37138", city: "Old Hickory", lat: 36.2413, lng: -86.6224 },
  { zip: "37143", city: "Pegram", lat: 36.1, lng: -87.0431 },
  { zip: "37167", city: "Smyrna", lat: 35.9713, lng: -86.5199 },
  { zip: "37174", city: "Spring Hill", lat: 35.7176, lng: -86.9075 },
  { zip: "37179", city: "Thompsons Station", lat: 35.8054, lng: -86.9124 },
  { zip: "37188", city: "White House", lat: 36.4719, lng: -86.6755 },
  { zip: "37189", city: "Whites Creek", lat: 36.2745, lng: -86.8309 },
];

export interface DealerRow {
  name: string;
  slug: string;
  address: string;
  city: string;
  zip: string;
  lat: number;
  lng: number;
  leadChannel: "inbox" | "email" | "none";
  docFee: number;
  responseMinutes: number | null;
  rating: number | null;
  /** Makes this dealer mostly carries (franchise-ish); empty = independent. */
  makes: string[];
  noHaggle?: boolean;
  homeDelivery?: boolean;
  atHomeTestDrive?: boolean;
  buyOnline?: boolean;
  /** Relative inventory size. */
  size: number;
}

// All names are fictional and for local demo data only.
export const DEALERS: DealerRow[] = [
  { name: "Music City Motors (Demo)", slug: "music-city-motors", address: "1200 Demo Pike", city: "Nashville", zip: "37210", lat: 36.1331, lng: -86.7362, leadChannel: "inbox", docFee: 599, responseMinutes: 35, rating: 4.7, makes: [], homeDelivery: true, atHomeTestDrive: true, size: 18 },
  { name: "Cumberland Motor Co.", slug: "cumberland-motor-co", address: "410 Riverfront Way", city: "Nashville", zip: "37207", lat: 36.2248, lng: -86.7702, leadChannel: "inbox", docFee: 699, responseMinutes: 60, rating: 4.5, makes: ["Toyota", "Lexus"], size: 16 },
  { name: "Harpeth Valley Auto", slug: "harpeth-valley-auto", address: "88 Harpeth Crossing", city: "Franklin", zip: "37067", lat: 35.9223, lng: -86.8166, leadChannel: "inbox", docFee: 799, responseMinutes: 45, rating: 4.6, makes: ["Honda", "Acura"], buyOnline: true, size: 15 },
  { name: "Stones River Motors", slug: "stones-river-motors", address: "2150 Old Fort Loop", city: "Murfreesboro", zip: "37129", lat: 35.8765, lng: -86.4212, leadChannel: "inbox", docFee: 649, responseMinutes: 90, rating: 4.3, makes: ["Ford"], size: 16 },
  { name: "Riverbend Auto Group", slug: "riverbend-auto-group", address: "3300 Lakeside Dr", city: "Hendersonville", zip: "37075", lat: 36.3122, lng: -86.6011, leadChannel: "inbox", docFee: 699, responseMinutes: 120, rating: 4.4, makes: ["Chevrolet", "GMC"], size: 14 },
  { name: "Five Points Autos", slug: "five-points-autos", address: "1010 Woodland Row", city: "Nashville", zip: "37206", lat: 36.1759, lng: -86.7483, leadChannel: "email", docFee: 499, responseMinutes: null, rating: 4.2, makes: [], noHaggle: true, size: 9 },
  { name: "Cool Springs Auto Gallery", slug: "cool-springs-auto-gallery", address: "720 Galleria Loop", city: "Franklin", zip: "37067", lat: 35.9551, lng: -86.8122, leadChannel: "email", docFee: 899, responseMinutes: null, rating: 4.6, makes: ["BMW", "Mercedes-Benz", "Audi", "Volvo"], atHomeTestDrive: true, size: 12 },
  { name: "Rivergate Motors", slug: "rivergate-motors", address: "2400 Gateway Blvd", city: "Madison", zip: "37115", lat: 36.2976, lng: -86.6949, leadChannel: "email", docFee: 699, responseMinutes: null, rating: 4.0, makes: ["Nissan"], size: 12 },
  { name: "Nolensville Pike Auto", slug: "nolensville-pike-auto", address: "5200 Pike Center", city: "Nashville", zip: "37211", lat: 36.0735, lng: -86.7258, leadChannel: "email", docFee: 499, responseMinutes: null, rating: 3.9, makes: [], size: 10 },
  { name: "Belle Meade Motorcars", slug: "belle-meade-motorcars", address: "6100 Harding Place", city: "Nashville", zip: "37205", lat: 36.1025, lng: -86.8727, leadChannel: "email", docFee: 899, responseMinutes: null, rating: 4.8, makes: ["Lexus", "BMW", "Mercedes-Benz"], size: 8 },
  { name: "Germantown Auto House", slug: "germantown-auto-house", address: "1300 Fifth Ave N", city: "Nashville", zip: "37208", lat: 36.1804, lng: -86.7937, leadChannel: "email", docFee: 599, responseMinutes: null, rating: 4.3, makes: ["Tesla", "Hyundai", "Kia"], size: 8 },
  { name: "Opry Mills Motors", slug: "opry-mills-motors", address: "455 Opry Mills Way", city: "Nashville", zip: "37214", lat: 36.2027, lng: -86.6947, leadChannel: "email", docFee: 699, responseMinutes: null, rating: 4.1, makes: ["Jeep", "Ram", "Dodge"], size: 12 },
  { name: "Mt. Juliet Motor Works", slug: "mt-juliet-motor-works", address: "900 Providence Pkwy", city: "Mount Juliet", zip: "37122", lat: 36.1703, lng: -86.5112, leadChannel: "email", docFee: 649, responseMinutes: null, rating: 4.4, makes: ["Subaru", "Mazda"], size: 11 },
  { name: "Franklin Main Street Motors", slug: "franklin-main-street-motors", address: "215 Main St", city: "Franklin", zip: "37064", lat: 35.9251, lng: -86.8689, leadChannel: "email", docFee: 599, responseMinutes: null, rating: 4.5, makes: [], size: 8 },
  { name: "Brentwood Premier Autos", slug: "brentwood-premier-autos", address: "7100 Church St E", city: "Brentwood", zip: "37027", lat: 36.0331, lng: -86.7828, leadChannel: "email", docFee: 799, responseMinutes: null, rating: 4.6, makes: ["Acura", "Lexus", "Volvo"], size: 8 },
  { name: "Antioch Auto Center", slug: "antioch-auto-center", address: "3800 Bell Rd", city: "Antioch", zip: "37013", lat: 36.0512, lng: -86.6721, leadChannel: "email", docFee: 499, responseMinutes: null, rating: 3.8, makes: [], size: 11 },
  { name: "Madison Motor Co.", slug: "madison-motor-co", address: "600 Gallatin Pike S", city: "Madison", zip: "37115", lat: 36.2517, lng: -86.7131, leadChannel: "none", docFee: 399, responseMinutes: null, rating: null, makes: [], size: 7 },
  { name: "Bellevue Auto Mart", slug: "bellevue-auto-mart", address: "7600 Hwy 70 S", city: "Nashville", zip: "37221", lat: 36.0692, lng: -86.9395, leadChannel: "none", docFee: 499, responseMinutes: null, rating: 4.0, makes: [], size: 7 },
  { name: "Smyrna Auto Plaza", slug: "smyrna-auto-plaza", address: "480 Nissan Dr", city: "Smyrna", zip: "37167", lat: 35.9819, lng: -86.5305, leadChannel: "none", docFee: 599, responseMinutes: null, rating: 4.1, makes: ["Nissan", "Chevrolet"], size: 9 },
  { name: "Lebanon Cedar Motors", slug: "lebanon-cedar-motors", address: "1500 W Main St", city: "Lebanon", zip: "37087", lat: 36.2085, lng: -86.3244, leadChannel: "none", docFee: 499, responseMinutes: null, rating: 4.2, makes: ["Ford", "Ram"], size: 8 },
  { name: "Spring Hill Auto Exchange", slug: "spring-hill-auto-exchange", address: "2000 Crossings Cir", city: "Spring Hill", zip: "37174", lat: 35.7361, lng: -86.9277, leadChannel: "none", docFee: 599, responseMinutes: null, rating: 4.3, makes: ["Chevrolet", "GMC"], size: 8 },
  { name: "Gallatin Road Cars", slug: "gallatin-road-cars", address: "1100 Nashville Pike", city: "Gallatin", zip: "37066", lat: 36.3712, lng: -86.4822, leadChannel: "none", docFee: 399, responseMinutes: null, rating: 3.9, makes: [], size: 7 },
  { name: "La Vergne Car Depot", slug: "la-vergne-car-depot", address: "250 Murfreesboro Rd", city: "La Vergne", zip: "37086", lat: 36.0156, lng: -86.5779, leadChannel: "none", docFee: 399, responseMinutes: null, rating: null, makes: [], size: 6 },
  { name: "Goodlettsville Truck & SUV", slug: "goodlettsville-truck-suv", address: "800 Long Hollow Pike", city: "Goodlettsville", zip: "37072", lat: 36.3291, lng: -86.7055, leadChannel: "none", docFee: 499, responseMinutes: null, rating: 4.1, makes: ["Toyota", "Ford", "Chevrolet", "Ram", "GMC"], size: 8 },
];
