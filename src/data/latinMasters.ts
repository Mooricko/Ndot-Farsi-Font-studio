import { CellType, GlyphData } from '../types/font';

export interface RawMasterDef {
  id: string;
  name: string;
  psName: string;
  category: GlyphData['category'];
  char: string;
  unicode?: number;
  altUnicodes?: number[];
  baseLetter?: string;
  contextualForm?: GlyphData['contextualForm'];
  joinsRight: boolean;
  joinsLeft: boolean;
  rows: string[]; // 11 strings, each width = advanceCols (up to 9). '.'=0, '#'=1, 'o'=2
  leftBearing?: number;
  rightBearing?: number;
}

export function buildGlyphFromRaw(def: RawMasterDef, gridCols = 9, gridRows = 11): GlyphData {
  const srcWidth = Math.max(1, ...def.rows.map((r) => r.length));
  const advanceCols = Math.min(gridCols, srcWidth);
  const cells: CellType[][] = Array.from({ length: gridRows }, (_, r) => {
    const line = def.rows[r] ?? '';
    return Array.from({ length: gridCols }, (_, c) => {
      const ch = c < line.length ? line[c] : '.';
      if (ch === '#') return 1;
      if (ch === 'o' || ch === 'O') return 2;
      return 0;
    });
  });

  return {
    id: def.id,
    name: def.name,
    psName: def.psName,
    category: def.category,
    char: def.char,
    unicode: def.unicode,
    altUnicodes: def.altUnicodes,
    baseLetter: def.baseLetter,
    contextualForm: def.contextualForm,
    joinsRight: def.joinsRight,
    joinsLeft: def.joinsLeft,
    cols: gridCols,
    rows: gridRows,
    cells,
    leftBearing: def.leftBearing ?? (def.joinsLeft ? 0 : 0.6),
    rightBearing: def.rightBearing ?? (def.joinsRight ? 0 : 0.6),
    advanceCols,
    isCustomized: false,
  };
}

// 11-row grid (rows 0..10), baseline on row 7. Uppercase spans rows 1..7 (7 dots tall),
// lowercase x-height spans rows 3..7 (5 dots tall), descenders reach row 9.
const RAW_LATIN_MASTERS: RawMasterDef[] = [
  // ASCII Digits 0-9
  {
    id: 'lat_0', name: 'Digit Zero', psName: 'zero', category: 'latin', char: '0', unicode: 0x0030, joinsRight: false, joinsLeft: false,
    rows: [
      '.....',
      '.###.',
      '#...#',
      '#..##',
      '#.#.#',
      '##..#',
      '#...#',
      '.###.',
      '.....',
      '.....',
      '.....',
    ],
  },
  {
    id: 'lat_1', name: 'Digit One', psName: 'one', category: 'latin', char: '1', unicode: 0x0031, joinsRight: false, joinsLeft: false,
    rows: [
      '....',
      '..#.',
      '.##.',
      '..#.',
      '..#.',
      '..#.',
      '..#.',
      '.###',
      '....',
      '....',
      '....',
    ],
  },
  {
    id: 'lat_2', name: 'Digit Two', psName: 'two', category: 'latin', char: '2', unicode: 0x0032, joinsRight: false, joinsLeft: false,
    rows: [
      '.....',
      '.###.',
      '#...#',
      '....#',
      '..##.',
      '.#...',
      '#....',
      '#####',
      '.....',
      '.....',
      '.....',
    ],
  },
  {
    id: 'lat_3', name: 'Digit Three', psName: 'three', category: 'latin', char: '3', unicode: 0x0033, joinsRight: false, joinsLeft: false,
    rows: [
      '.....',
      '.###.',
      '#...#',
      '....#',
      '..##.',
      '....#',
      '#...#',
      '.###.',
      '.....',
      '.....',
      '.....',
    ],
  },
  {
    id: 'lat_4', name: 'Digit Four', psName: 'four', category: 'latin', char: '4', unicode: 0x0034, joinsRight: false, joinsLeft: false,
    rows: [
      '.....',
      '...#.',
      '..##.',
      '.#.#.',
      '#..#.',
      '#####',
      '...#.',
      '...#.',
      '.....',
      '.....',
      '.....',
    ],
  },
  {
    id: 'lat_5', name: 'Digit Five', psName: 'five', category: 'latin', char: '5', unicode: 0x0035, joinsRight: false, joinsLeft: false,
    rows: [
      '.....',
      '#####',
      '#....',
      '####.',
      '....#',
      '....#',
      '#...#',
      '.###.',
      '.....',
      '.....',
      '.....',
    ],
  },
  {
    id: 'lat_6', name: 'Digit Six', psName: 'six', category: 'latin', char: '6', unicode: 0x0036, joinsRight: false, joinsLeft: false,
    rows: [
      '.....',
      '.###.',
      '#....',
      '#....',
      '####.',
      '#...#',
      '#...#',
      '.###.',
      '.....',
      '.....',
      '.....',
    ],
  },
  {
    id: 'lat_7', name: 'Digit Seven', psName: 'seven', category: 'latin', char: '7', unicode: 0x0037, joinsRight: false, joinsLeft: false,
    rows: [
      '.....',
      '#####',
      '....#',
      '...#.',
      '..#..',
      '.#...',
      '.#...',
      '.#...',
      '.....',
      '.....',
      '.....',
    ],
  },
  {
    id: 'lat_8', name: 'Digit Eight', psName: 'eight', category: 'latin', char: '8', unicode: 0x0038, joinsRight: false, joinsLeft: false,
    rows: [
      '.....',
      '.###.',
      '#...#',
      '#...#',
      '.###.',
      '#...#',
      '#...#',
      '.###.',
      '.....',
      '.....',
      '.....',
    ],
  },
  {
    id: 'lat_9', name: 'Digit Nine', psName: 'nine', category: 'latin', char: '9', unicode: 0x0039, joinsRight: false, joinsLeft: false,
    rows: [
      '.....',
      '.###.',
      '#...#',
      '#...#',
      '.####',
      '....#',
      '...#.',
      '.##..',
      '.....',
      '.....',
      '.....',
    ],
  },

  // Uppercase A-Z
  {
    id: 'lat_A', name: 'Latin A', psName: 'A', category: 'latin', char: 'A', unicode: 0x0041, joinsRight: false, joinsLeft: false,
    rows: ['.....', '..#..', '.#.#.', '#...#', '#...#', '#####', '#...#', '#...#', '.....', '.....', '.....'],
  },
  {
    id: 'lat_B', name: 'Latin B', psName: 'B', category: 'latin', char: 'B', unicode: 0x0042, joinsRight: false, joinsLeft: false,
    rows: ['.....', '####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.', '.....', '.....', '.....'],
  },
  {
    id: 'lat_C', name: 'Latin C', psName: 'C', category: 'latin', char: 'C', unicode: 0x0043, joinsRight: false, joinsLeft: false,
    rows: ['.....', '.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.', '.....', '.....', '.....'],
  },
  {
    id: 'lat_D', name: 'Latin D', psName: 'D', category: 'latin', char: 'D', unicode: 0x0044, joinsRight: false, joinsLeft: false,
    rows: ['.....', '####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.', '.....', '.....', '.....'],
  },
  {
    id: 'lat_E', name: 'Latin E', psName: 'E', category: 'latin', char: 'E', unicode: 0x0045, joinsRight: false, joinsLeft: false,
    rows: ['.....', '#####', '#....', '#....', '####.', '#....', '#....', '#####', '.....', '.....', '.....'],
  },
  {
    id: 'lat_F', name: 'Latin F', psName: 'F', category: 'latin', char: 'F', unicode: 0x0046, joinsRight: false, joinsLeft: false,
    rows: ['.....', '#####', '#....', '#....', '####.', '#....', '#....', '#....', '.....', '.....', '.....'],
  },
  {
    id: 'lat_G', name: 'Latin G', psName: 'G', category: 'latin', char: 'G', unicode: 0x0047, joinsRight: false, joinsLeft: false,
    rows: ['.....', '.###.', '#...#', '#....', '#..##', '#...#', '#...#', '.###.', '.....', '.....', '.....'],
  },
  {
    id: 'lat_H', name: 'Latin H', psName: 'H', category: 'latin', char: 'H', unicode: 0x0048, joinsRight: false, joinsLeft: false,
    rows: ['.....', '#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#', '.....', '.....', '.....'],
  },
  {
    id: 'lat_I', name: 'Latin I', psName: 'I', category: 'latin', char: 'I', unicode: 0x0049, joinsRight: false, joinsLeft: false,
    rows: ['...', '###', '.#.', '.#.', '.#.', '.#.', '.#.', '###', '...', '...', '...'],
  },
  {
    id: 'lat_J', name: 'Latin J', psName: 'J', category: 'latin', char: 'J', unicode: 0x004a, joinsRight: false, joinsLeft: false,
    rows: ['.....', '..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..', '.....', '.....', '.....'],
  },
  {
    id: 'lat_K', name: 'Latin K', psName: 'K', category: 'latin', char: 'K', unicode: 0x004b, joinsRight: false, joinsLeft: false,
    rows: ['.....', '#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#', '.....', '.....', '.....'],
  },
  {
    id: 'lat_L', name: 'Latin L', psName: 'L', category: 'latin', char: 'L', unicode: 0x004c, joinsRight: false, joinsLeft: false,
    rows: ['.....', '#....', '#....', '#....', '#....', '#....', '#....', '#####', '.....', '.....', '.....'],
  },
  {
    id: 'lat_M', name: 'Latin M', psName: 'M', category: 'latin', char: 'M', unicode: 0x004d, joinsRight: false, joinsLeft: false,
    rows: ['.....', '#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#', '.....', '.....', '.....'],
  },
  {
    id: 'lat_N', name: 'Latin N', psName: 'N', category: 'latin', char: 'N', unicode: 0x004e, joinsRight: false, joinsLeft: false,
    rows: ['.....', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#', '.....', '.....', '.....'],
  },
  {
    id: 'lat_O', name: 'Latin O', psName: 'O', category: 'latin', char: 'O', unicode: 0x004f, joinsRight: false, joinsLeft: false,
    rows: ['.....', '.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.', '.....', '.....', '.....'],
  },
  {
    id: 'lat_P', name: 'Latin P', psName: 'P', category: 'latin', char: 'P', unicode: 0x0050, joinsRight: false, joinsLeft: false,
    rows: ['.....', '####.', '#...#', '#...#', '####.', '#....', '#....', '#....', '.....', '.....', '.....'],
  },
  {
    id: 'lat_Q', name: 'Latin Q', psName: 'Q', category: 'latin', char: 'Q', unicode: 0x0051, joinsRight: false, joinsLeft: false,
    rows: ['.....', '.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#', '.....', '.....', '.....'],
  },
  {
    id: 'lat_R', name: 'Latin R', psName: 'R', category: 'latin', char: 'R', unicode: 0x0052, joinsRight: false, joinsLeft: false,
    rows: ['.....', '####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#', '.....', '.....', '.....'],
  },
  {
    id: 'lat_S', name: 'Latin S', psName: 'S', category: 'latin', char: 'S', unicode: 0x0053, joinsRight: false, joinsLeft: false,
    rows: ['.....', '.###.', '#...#', '#....', '.###.', '....#', '#...#', '.###.', '.....', '.....', '.....'],
  },
  {
    id: 'lat_T', name: 'Latin T', psName: 'T', category: 'latin', char: 'T', unicode: 0x0054, joinsRight: false, joinsLeft: false,
    rows: ['.....', '#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..', '.....', '.....', '.....'],
  },
  {
    id: 'lat_U', name: 'Latin U', psName: 'U', category: 'latin', char: 'U', unicode: 0x0055, joinsRight: false, joinsLeft: false,
    rows: ['.....', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.', '.....', '.....', '.....'],
  },
  {
    id: 'lat_V', name: 'Latin V', psName: 'V', category: 'latin', char: 'V', unicode: 0x0056, joinsRight: false, joinsLeft: false,
    rows: ['.....', '#...#', '#...#', '#...#', '#...#', '.#.#.', '.#.#.', '..#..', '.....', '.....', '.....'],
  },
  {
    id: 'lat_W', name: 'Latin W', psName: 'W', category: 'latin', char: 'W', unicode: 0x0057, joinsRight: false, joinsLeft: false,
    rows: ['.....', '#...#', '#...#', '#...#', '#...#', '#.#.#', '##.##', '#...#', '.....', '.....', '.....'],
  },
  {
    id: 'lat_X', name: 'Latin X', psName: 'X', category: 'latin', char: 'X', unicode: 0x0058, joinsRight: false, joinsLeft: false,
    rows: ['.....', '#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#', '.....', '.....', '.....'],
  },
  {
    id: 'lat_Y', name: 'Latin Y', psName: 'Y', category: 'latin', char: 'Y', unicode: 0x0059, joinsRight: false, joinsLeft: false,
    rows: ['.....', '#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..', '.....', '.....', '.....'],
  },
  {
    id: 'lat_Z', name: 'Latin Z', psName: 'Z', category: 'latin', char: 'Z', unicode: 0x005a, joinsRight: false, joinsLeft: false,
    rows: ['.....', '#####', '....#', '...#.', '..#..', '.#...', '#....', '#####', '.....', '.....', '.....'],
  },

  // Lowercase a-z
  {
    id: 'lat_a', name: 'Latin a', psName: 'a', category: 'latin', char: 'a', unicode: 0x0061, joinsRight: false, joinsLeft: false,
    rows: ['.....', '.....', '.....', '.###.', '....#', '.####', '#...#', '.####', '.....', '.....', '.....'],
  },
  {
    id: 'lat_b', name: 'Latin b', psName: 'b', category: 'latin', char: 'b', unicode: 0x0062, joinsRight: false, joinsLeft: false,
    rows: ['.....', '#....', '#....', '####.', '#...#', '#...#', '#...#', '####.', '.....', '.....', '.....'],
  },
  {
    id: 'lat_c', name: 'Latin c', psName: 'c', category: 'latin', char: 'c', unicode: 0x0063, joinsRight: false, joinsLeft: false,
    rows: ['.....', '.....', '.....', '.###.', '#...#', '#....', '#...#', '.###.', '.....', '.....', '.....'],
  },
  {
    id: 'lat_d', name: 'Latin d', psName: 'd', category: 'latin', char: 'd', unicode: 0x0064, joinsRight: false, joinsLeft: false,
    rows: ['.....', '....#', '....#', '.####', '#...#', '#...#', '#...#', '.####', '.....', '.....', '.....'],
  },
  {
    id: 'lat_e', name: 'Latin e', psName: 'e', category: 'latin', char: 'e', unicode: 0x0065, joinsRight: false, joinsLeft: false,
    rows: ['.....', '.....', '.....', '.###.', '#...#', '#####', '#....', '.###.', '.....', '.....', '.....'],
  },
  {
    id: 'lat_f', name: 'Latin f', psName: 'f', category: 'latin', char: 'f', unicode: 0x0066, joinsRight: false, joinsLeft: false,
    rows: ['....', '..##', '.#..', '####', '.#..', '.#..', '.#..', '.#..', '....', '....', '....'],
  },
  {
    id: 'lat_g', name: 'Latin g', psName: 'g', category: 'latin', char: 'g', unicode: 0x0067, joinsRight: false, joinsLeft: false,
    rows: ['.....', '.....', '.....', '.####', '#...#', '#...#', '.####', '....#', '#...#', '.###.', '.....'],
  },
  {
    id: 'lat_h', name: 'Latin h', psName: 'h', category: 'latin', char: 'h', unicode: 0x0068, joinsRight: false, joinsLeft: false,
    rows: ['.....', '#....', '#....', '####.', '#...#', '#...#', '#...#', '#...#', '.....', '.....', '.....'],
  },
  {
    id: 'lat_i', name: 'Latin i', psName: 'i', category: 'latin', char: 'i', unicode: 0x0069, joinsRight: false, joinsLeft: false,
    rows: ['...', '.#.', '...', '##.', '.#.', '.#.', '.#.', '###', '...', '...', '...'],
  },
  {
    id: 'lat_j', name: 'Latin j', psName: 'j', category: 'latin', char: 'j', unicode: 0x006a, joinsRight: false, joinsLeft: false,
    rows: ['....', '..#.', '....', '.##.', '..#.', '..#.', '..#.', '..#.', '#.#.', '.#..', '....'],
  },
  {
    id: 'lat_k', name: 'Latin k', psName: 'k', category: 'latin', char: 'k', unicode: 0x006b, joinsRight: false, joinsLeft: false,
    rows: ['.....', '#....', '#....', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '.....', '.....', '.....'],
  },
  {
    id: 'lat_l', name: 'Latin l', psName: 'l', category: 'latin', char: 'l', unicode: 0x006c, joinsRight: false, joinsLeft: false,
    rows: ['...', '##.', '.#.', '.#.', '.#.', '.#.', '.#.', '###', '...', '...', '...'],
  },
  {
    id: 'lat_m', name: 'Latin m', psName: 'm', category: 'latin', char: 'm', unicode: 0x006d, joinsRight: false, joinsLeft: false,
    rows: ['.....', '.....', '.....', '##.#.', '#.#.#', '#.#.#', '#.#.#', '#...#', '.....', '.....', '.....'],
  },
  {
    id: 'lat_n', name: 'Latin n', psName: 'n', category: 'latin', char: 'n', unicode: 0x006e, joinsRight: false, joinsLeft: false,
    rows: ['.....', '.....', '.....', '####.', '#...#', '#...#', '#...#', '#...#', '.....', '.....', '.....'],
  },
  {
    id: 'lat_o', name: 'Latin o', psName: 'o', category: 'latin', char: 'o', unicode: 0x006f, joinsRight: false, joinsLeft: false,
    rows: ['.....', '.....', '.....', '.###.', '#...#', '#...#', '#...#', '.###.', '.....', '.....', '.....'],
  },
  {
    id: 'lat_p', name: 'Latin p', psName: 'p', category: 'latin', char: 'p', unicode: 0x0070, joinsRight: false, joinsLeft: false,
    rows: ['.....', '.....', '.....', '####.', '#...#', '#...#', '####.', '#....', '#....', '#....', '.....'],
  },
  {
    id: 'lat_q', name: 'Latin q', psName: 'q', category: 'latin', char: 'q', unicode: 0x0071, joinsRight: false, joinsLeft: false,
    rows: ['.....', '.....', '.....', '.####', '#...#', '#...#', '.####', '....#', '....#', '....#', '.....'],
  },
  {
    id: 'lat_r', name: 'Latin r', psName: 'r', category: 'latin', char: 'r', unicode: 0x0072, joinsRight: false, joinsLeft: false,
    rows: ['....', '....', '....', '#.##', '##..', '#...', '#...', '#...', '....', '....', '....'],
  },
  {
    id: 'lat_s', name: 'Latin s', psName: 's', category: 'latin', char: 's', unicode: 0x0073, joinsRight: false, joinsLeft: false,
    rows: ['.....', '.....', '.....', '.####', '#....', '.###.', '....#', '####.', '.....', '.....', '.....'],
  },
  {
    id: 'lat_t', name: 'Latin t', psName: 't', category: 'latin', char: 't', unicode: 0x0074, joinsRight: false, joinsLeft: false,
    rows: ['....', '.#..', '.#..', '####', '.#..', '.#..', '.#..', '..##', '....', '....', '....'],
  },
  {
    id: 'lat_u', name: 'Latin u', psName: 'u', category: 'latin', char: 'u', unicode: 0x0075, joinsRight: false, joinsLeft: false,
    rows: ['.....', '.....', '.....', '#...#', '#...#', '#...#', '#...#', '.####', '.....', '.....', '.....'],
  },
  {
    id: 'lat_v', name: 'Latin v', psName: 'v', category: 'latin', char: 'v', unicode: 0x0076, joinsRight: false, joinsLeft: false,
    rows: ['.....', '.....', '.....', '#...#', '#...#', '#...#', '.#.#.', '..#..', '.....', '.....', '.....'],
  },
  {
    id: 'lat_w', name: 'Latin w', psName: 'w', category: 'latin', char: 'w', unicode: 0x0077, joinsRight: false, joinsLeft: false,
    rows: ['.....', '.....', '.....', '#...#', '#...#', '#.#.#', '#.#.#', '.#.#.', '.....', '.....', '.....'],
  },
  {
    id: 'lat_x', name: 'Latin x', psName: 'x', category: 'latin', char: 'x', unicode: 0x0078, joinsRight: false, joinsLeft: false,
    rows: ['.....', '.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '.....', '.....', '.....'],
  },
  {
    id: 'lat_y', name: 'Latin y', psName: 'y', category: 'latin', char: 'y', unicode: 0x0079, joinsRight: false, joinsLeft: false,
    rows: ['.....', '.....', '.....', '#...#', '#...#', '#...#', '.####', '....#', '#...#', '.###.', '.....'],
  },
  {
    id: 'lat_z', name: 'Latin z', psName: 'z', category: 'latin', char: 'z', unicode: 0x007a, joinsRight: false, joinsLeft: false,
    rows: ['.....', '.....', '.....', '#####', '...#.', '..#..', '.#...', '#####', '.....', '.....', '.....'],
  },
];

export function createLatinMasters(): GlyphData[] {
  return RAW_LATIN_MASTERS.map((def) => buildGlyphFromRaw(def, 9, 11));
}
