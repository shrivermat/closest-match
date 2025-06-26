import { RichTextParser } from '../src/rich-text-parser';

describe('RichTextParser', () => {
  describe('parseHTML', () => {
    it('should parse plain text', () => {
      const result = RichTextParser.parseHTML('Hello world');
      
      expect(result.plainText).toBe('Hello world');
      expect(result.hasFormatting).toBe(false);
      expect(result.segments).toHaveLength(1);
      expect(result.segments[0].text).toBe('Hello world');
      expect(result.segments[0].formatting).toEqual({});
    });

    it('should parse bold text', () => {
      const result = RichTextParser.parseHTML('<strong>Bold text</strong>');
      
      expect(result.plainText).toBe('Bold text');
      expect(result.hasFormatting).toBe(true);
      expect(result.segments).toHaveLength(1);
      expect(result.segments[0].formatting.bold).toBe(true);
    });

    it('should parse italic text', () => {
      const result = RichTextParser.parseHTML('<em>Italic text</em>');
      
      expect(result.plainText).toBe('Italic text');
      expect(result.hasFormatting).toBe(true);
      expect(result.segments[0].formatting.italic).toBe(true);
    });

    it('should parse underlined text', () => {
      const result = RichTextParser.parseHTML('<u>Underlined text</u>');
      
      expect(result.plainText).toBe('Underlined text');
      expect(result.hasFormatting).toBe(true);
      expect(result.segments[0].formatting.underline).toBe(true);
    });

    it('should parse strikethrough text', () => {
      const result = RichTextParser.parseHTML('<s>Strikethrough text</s>');
      
      expect(result.plainText).toBe('Strikethrough text');
      expect(result.hasFormatting).toBe(true);
      expect(result.segments[0].formatting.strikethrough).toBe(true);
    });

    it('should parse colored text', () => {
      const result = RichTextParser.parseHTML('<span style="color: red;">Red text</span>');
      
      expect(result.plainText).toBe('Red text');
      expect(result.hasFormatting).toBe(true);
      expect(result.segments[0].formatting.color).toBe('red');
    });

    it('should parse background colored text', () => {
      const result = RichTextParser.parseHTML('<span style="background-color: yellow;">Highlighted text</span>');
      
      expect(result.plainText).toBe('Highlighted text');
      expect(result.hasFormatting).toBe(true);
      expect(result.segments[0].formatting.backgroundColor).toBe('yellow');
    });

    it('should parse multiple formatting attributes', () => {
      const result = RichTextParser.parseHTML('<strong><em style="color: blue;">Bold italic blue text</em></strong>');
      
      expect(result.plainText).toBe('Bold italic blue text');
      expect(result.hasFormatting).toBe(true);
      expect(result.segments[0].formatting.bold).toBe(true);
      expect(result.segments[0].formatting.italic).toBe(true);
      expect(result.segments[0].formatting.color).toBe('blue');
    });

    it('should parse mixed formatted and plain text', () => {
      const result = RichTextParser.parseHTML('Normal text <strong>bold text</strong> more normal text');
      
      expect(result.plainText).toBe('Normal text bold text more normal text');
      expect(result.hasFormatting).toBe(true);
      expect(result.segments).toHaveLength(3);
      expect(result.segments[0].text).toBe('Normal text ');
      expect(result.segments[0].formatting).toEqual({});
      expect(result.segments[1].text).toBe('bold text');
      expect(result.segments[1].formatting.bold).toBe(true);
      expect(result.segments[2].text).toBe(' more normal text');
      expect(result.segments[2].formatting).toEqual({});
    });

    it('should handle font size', () => {
      const result = RichTextParser.parseHTML('<span style="font-size: 16px;">Sized text</span>');
      
      expect(result.segments[0].formatting.fontSize).toBe(16);
    });

    it('should handle font family', () => {
      const result = RichTextParser.parseHTML('<span style="font-family: Arial;">Arial text</span>');
      
      expect(result.segments[0].formatting.fontFamily).toBe('Arial');
    });
  });

  describe('parseRTF', () => {
    it('should parse simple RTF text', () => {
      const rtfContent = '{\\rtf1\\ansi\\deff0 Plain text}';
      const result = RichTextParser.parseRTF(rtfContent);
      
      expect(result.plainText).toBe('Plain text');
      expect(result.hasFormatting).toBe(false);
    });

    it('should parse RTF with bold formatting', () => {
      const rtfContent = '{\\rtf1\\ansi\\deff0 \\b Bold text}';
      const result = RichTextParser.parseRTF(rtfContent);
      
      expect(result.plainText).toBe('Bold text');
      expect(result.hasFormatting).toBe(true);
      expect(result.segments[0].formatting.bold).toBe(true);
    });

    it('should parse RTF with italic formatting', () => {
      const rtfContent = '{\\rtf1\\ansi\\deff0 \\i Italic text}';
      const result = RichTextParser.parseRTF(rtfContent);
      
      expect(result.segments[0].formatting.italic).toBe(true);
    });

    it('should parse RTF with underline formatting', () => {
      const rtfContent = '{\\rtf1\\ansi\\deff0 \\ul Underlined text}';
      const result = RichTextParser.parseRTF(rtfContent);
      
      expect(result.segments[0].formatting.underline).toBe(true);
    });

    it('should parse RTF with strikethrough formatting', () => {
      const rtfContent = '{\\rtf1\\ansi\\deff0 \\strike Strikethrough text}';
      const result = RichTextParser.parseRTF(rtfContent);
      
      expect(result.segments[0].formatting.strikethrough).toBe(true);
    });

    it('should parse RTF with font size', () => {
      const rtfContent = '{\\rtf1\\ansi\\deff0 \\fs24 Text with font size}';
      const result = RichTextParser.parseRTF(rtfContent);
      
      expect(result.segments[0].formatting.fontSize).toBe(12); // RTF size 24 = 12pt
    });
  });

  describe('parseAuto', () => {
    it('should auto-detect HTML content', () => {
      const result = RichTextParser.parseAuto('<strong>Bold HTML</strong>');
      
      expect(result.plainText).toBe('Bold HTML');
      expect(result.segments[0].formatting.bold).toBe(true);
    });

    it('should auto-detect RTF content', () => {
      const result = RichTextParser.parseAuto('{\\rtf1\\ansi\\deff0 \\b Bold RTF}');
      
      expect(result.plainText).toBe('Bold RTF');
      expect(result.segments[0].formatting.bold).toBe(true);
    });

    it('should treat unknown format as plain text', () => {
      const result = RichTextParser.parseAuto('Just plain text');
      
      expect(result.plainText).toBe('Just plain text');
      expect(result.hasFormatting).toBe(false);
    });
  });

  describe('toSearchQueries', () => {
    it('should convert plain text to single query', () => {
      const parsedText = {
        plainText: 'Hello world',
        segments: [{
          text: 'Hello world',
          formatting: {},
          startIndex: 0,
          endIndex: 11
        }],
        hasFormatting: false
      };
      
      const queries = RichTextParser.toSearchQueries(parsedText);
      
      expect(queries).toHaveLength(1);
      expect(queries[0].text).toBe('Hello world');
      expect(queries[0].annotationType).toBe('rectangle');
      expect(queries[0].formatting).toBeUndefined();
    });

    it('should convert formatted text to query with formatting', () => {
      const parsedText = {
        plainText: 'Bold text',
        segments: [{
          text: 'Bold text',
          formatting: { bold: true, color: 'red' },
          startIndex: 0,
          endIndex: 9
        }],
        hasFormatting: true
      };
      
      const queries = RichTextParser.toSearchQueries(parsedText);
      
      expect(queries).toHaveLength(1);
      expect(queries[0].text).toBe('Bold text');
      expect(queries[0].annotationType).toBe('rectangle');
      expect(queries[0].formatting).toEqual({ color: 'red' });
    });

    it('should detect annotation type from formatting', () => {
      const parsedText = {
        plainText: 'Highlighted text',
        segments: [{
          text: 'Highlighted text',
          formatting: { backgroundColor: 'yellow' },
          startIndex: 0,
          endIndex: 16
        }],
        hasFormatting: true
      };
      
      const queries = RichTextParser.toSearchQueries(parsedText);
      
      expect(queries[0].annotationType).toBe('highlight');
      expect(queries[0].formatting).toEqual({ backgroundColor: 'yellow' });
    });

    it('should detect underline annotation type', () => {
      const parsedText = {
        plainText: 'Underlined text',
        segments: [{
          text: 'Underlined text',
          formatting: { underline: true },
          startIndex: 0,
          endIndex: 15
        }],
        hasFormatting: true
      };
      
      const queries = RichTextParser.toSearchQueries(parsedText);
      
      expect(queries[0].annotationType).toBe('underline');
      expect(queries[0].formatting).toEqual({ decorations: ['underline'] });
    });

    it('should detect strikethrough annotation type', () => {
      const parsedText = {
        plainText: 'Strikethrough text',
        segments: [{
          text: 'Strikethrough text',
          formatting: { strikethrough: true },
          startIndex: 0,
          endIndex: 18
        }],
        hasFormatting: true
      };
      
      const queries = RichTextParser.toSearchQueries(parsedText);
      
      expect(queries[0].annotationType).toBe('strikethrough');
      expect(queries[0].formatting).toEqual({ decorations: ['strikethrough'] });
    });

    it('should group consecutive segments with same formatting', () => {
      const parsedText = {
        plainText: 'Bold text more bold',
        segments: [
          {
            text: 'Bold text ',
            formatting: { bold: true, color: 'red' },
            startIndex: 0,
            endIndex: 10
          },
          {
            text: 'more bold',
            formatting: { bold: true, color: 'red' },
            startIndex: 10,
            endIndex: 19
          }
        ],
        hasFormatting: true
      };
      
      const queries = RichTextParser.toSearchQueries(parsedText);
      
      expect(queries).toHaveLength(1);
      expect(queries[0].text).toBe('Bold text more bold');
      expect(queries[0].formatting).toEqual({ color: 'red' });
    });

    it('should split segments with different formatting', () => {
      const parsedText = {
        plainText: 'Red text blue text',
        segments: [
          {
            text: 'Red text ',
            formatting: { color: 'red' },
            startIndex: 0,
            endIndex: 9
          },
          {
            text: 'blue text',
            formatting: { color: 'blue' },
            startIndex: 9,
            endIndex: 18
          }
        ],
        hasFormatting: true
      };
      
      const queries = RichTextParser.toSearchQueries(parsedText);
      
      expect(queries).toHaveLength(2);
      expect(queries[0].text).toBe('Red text');
      expect(queries[0].formatting).toEqual({ color: 'red' });
      expect(queries[1].text).toBe('blue text');
      expect(queries[1].formatting).toEqual({ color: 'blue' });
    });
  });
});