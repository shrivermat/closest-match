/**
 * Rich Text Parser for Document Annotator
 * Supports parsing HTML and RTF formatted search queries
 * Extracts text content and formatting information
 */

export interface TextSegment {
  text: string;
  formatting: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    color?: string;
    backgroundColor?: string;
    fontSize?: number;
    fontFamily?: string;
  };
  startIndex: number;
  endIndex: number;
}

export interface ParsedRichText {
  plainText: string;
  segments: TextSegment[];
  hasFormatting: boolean;
}

export class RichTextParser {
  /**
   * Parse HTML formatted text
   */
  static parseHTML(htmlContent: string): ParsedRichText {
    // Create a temporary DOM element to parse HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;

    const segments: TextSegment[] = [];
    let plainText = '';
    let currentIndex = 0;

    // Recursively process DOM nodes
    const processNode = (node: Node, inheritedFormatting: Partial<TextSegment['formatting']> = {}): void => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (text.length > 0) {
          const startIndex = currentIndex;
          const endIndex = currentIndex + text.length;
          
          segments.push({
            text,
            formatting: { ...inheritedFormatting },
            startIndex,
            endIndex
          });
          
          plainText += text;
          currentIndex += text.length;
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        const newFormatting = this.extractHTMLFormatting(element, inheritedFormatting);
        
        // Process child nodes with inherited formatting
        for (const childNode of Array.from(element.childNodes)) {
          processNode(childNode, newFormatting);
        }
      }
    };

    // Process all child nodes
    for (const childNode of Array.from(tempDiv.childNodes)) {
      processNode(childNode);
    }

    return {
      plainText: plainText.trim(),
      segments,
      hasFormatting: segments.some(segment => Object.keys(segment.formatting).length > 0)
    };
  }

  /**
   * Parse RTF formatted text (simplified implementation)
   */
  static parseRTF(rtfContent: string): ParsedRichText {
    // This is a simplified RTF parser for basic formatting
    // In production, you might want to use a more robust RTF parser library
    
    const segments: TextSegment[] = [];
    let plainText = '';
    let currentIndex = 0;
    
    // Remove RTF header and control sequences, extract plain text
    let cleanText = rtfContent
      .replace(/\\rtf\d+/g, '') // Remove RTF version
      .replace(/\\ansi/g, '') // Remove ANSI declaration
      .replace(/\\deff\d+/g, '') // Remove default font
      .replace(/\{\\fonttbl[^}]*\}/g, '') // Remove font table
      .replace(/\{\\colortbl[^}]*\}/g, '') // Remove color table
      .replace(/\\viewkind\d+/g, '') // Remove view kind
      .replace(/\\uc\d+/g, '') // Remove unicode skip count
      .replace(/\\lang\d+/g, '') // Remove language
      .replace(/\\f\d+/g, '') // Remove font references
      .replace(/\\fs\d+/g, '') // Remove font size (we'll parse this separately)
      .replace(/\\par/g, '\n') // Convert paragraph breaks
      .replace(/\\\\/g, '\\') // Unescape backslashes
      .replace(/\{/g, '') // Remove opening braces
      .replace(/\}/g, ''); // Remove closing braces

    // Extract formatting information (basic implementation)
    const formatTokens = rtfContent.match(/\\[a-z]+\d*/g) || [];
    const formatting: TextSegment['formatting'] = {};

    for (const token of formatTokens) {
      if (token === '\\b') {
        formatting.bold = true;
      } else if (token === '\\i') {
        formatting.italic = true;
      } else if (token === '\\ul') {
        formatting.underline = true;
      } else if (token === '\\strike') {
        formatting.strikethrough = true;
      } else if (token.startsWith('\\fs')) {
        const fontSize = parseInt(token.slice(3));
        if (!isNaN(fontSize)) {
          formatting.fontSize = fontSize / 2; // RTF font size is in half-points
        }
      }
    }

    plainText = cleanText.trim();
    
    if (plainText.length > 0) {
      segments.push({
        text: plainText,
        formatting,
        startIndex: 0,
        endIndex: plainText.length
      });
    }

    return {
      plainText,
      segments,
      hasFormatting: Object.keys(formatting || {}).length > 0
    };
  }

  /**
   * Convert parsed rich text to search queries with formatting
   */
  static toSearchQueries(
    parsedText: ParsedRichText,
    defaultAnnotationType: 'rectangle' | 'highlight' | 'underline' | 'strikethrough' = 'rectangle'
  ): import('./types').SearchQuery[] {
    if (!parsedText.hasFormatting || parsedText.segments.length === 0) {
      // Return single query for plain text
      return [{
        text: parsedText.plainText,
        annotationType: defaultAnnotationType
      }];
    }

    // Group consecutive segments with same formatting
    const queries: import('./types').SearchQuery[] = [];
    let currentGroup: TextSegment[] = [];
    let currentFormatting: TextSegment['formatting'] = {};

    for (const segment of parsedText.segments) {
      const isSameFormatting = this.compareFormatting(segment.formatting, currentFormatting);
      
      if (!isSameFormatting && currentGroup.length > 0) {
        // Finish current group
        const groupText = currentGroup.map(s => s.text).join('');
        const annotationType = this.getAnnotationTypeFromFormatting(currentFormatting, defaultAnnotationType);
        const formatting = this.convertToQueryFormatting(currentFormatting);
        
        queries.push({
          text: groupText.trim(),
          annotationType,
          formatting: Object.keys(formatting || {}).length > 0 ? formatting : undefined
        });
        
        currentGroup = [];
      }
      
      currentGroup.push(segment);
      currentFormatting = segment.formatting;
    }

    // Handle last group
    if (currentGroup.length > 0) {
      const groupText = currentGroup.map(s => s.text).join('');
      const annotationType = this.getAnnotationTypeFromFormatting(currentFormatting, defaultAnnotationType);
      const formatting = this.convertToQueryFormatting(currentFormatting);
      
      queries.push({
        text: groupText.trim(),
        annotationType,
        formatting: Object.keys(formatting || {}).length > 0 ? formatting : undefined
      });
    }

    return queries.filter(q => q.text.length > 0);
  }

  /**
   * Parse mixed format content (auto-detect HTML vs RTF vs plain text)
   */
  static parseAuto(content: string): ParsedRichText {
    const trimmedContent = content.trim();
    
    if (trimmedContent.startsWith('{\\rtf')) {
      return this.parseRTF(content);
    } else if (trimmedContent.includes('<') && trimmedContent.includes('>')) {
      return this.parseHTML(content);
    } else {
      // Plain text
      return {
        plainText: trimmedContent,
        segments: [{
          text: trimmedContent,
          formatting: {},
          startIndex: 0,
          endIndex: trimmedContent.length
        }],
        hasFormatting: false
      };
    }
  }

  // Private helper methods

  private static extractHTMLFormatting(
    element: Element,
    inherited: Partial<TextSegment['formatting']>
  ): TextSegment['formatting'] {
    const formatting = { ...inherited };
    const tagName = element.tagName.toLowerCase();
    const style = element.getAttribute('style') || '';

    // Handle semantic tags
    switch (tagName) {
      case 'b':
      case 'strong':
        formatting.bold = true;
        break;
      case 'i':
      case 'em':
        formatting.italic = true;
        break;
      case 'u':
        formatting.underline = true;
        break;
      case 'strike':
      case 's':
        formatting.strikethrough = true;
        break;
    }

    // Parse inline styles
    if (style) {
      const styleRules = style.split(';').map(rule => rule.trim()).filter(rule => rule);
      
      for (const rule of styleRules) {
        const [property, value] = rule.split(':').map(part => part.trim());
        
        switch (property) {
          case 'color':
            formatting.color = value;
            break;
          case 'background-color':
          case 'background':
            formatting.backgroundColor = value;
            break;
          case 'font-weight':
            if (value === 'bold' || parseInt(value) >= 600) {
              formatting.bold = true;
            }
            break;
          case 'font-style':
            if (value === 'italic') {
              formatting.italic = true;
            }
            break;
          case 'text-decoration':
            if (value.includes('underline')) {
              formatting.underline = true;
            }
            if (value.includes('line-through')) {
              formatting.strikethrough = true;
            }
            break;
          case 'font-size':
            const fontSize = parseFloat(value);
            if (!isNaN(fontSize)) {
              formatting.fontSize = fontSize;
            }
            break;
          case 'font-family':
            formatting.fontFamily = value.replace(/['"]/g, '');
            break;
        }
      }
    }

    return formatting;
  }

  private static compareFormatting(
    formatting1: TextSegment['formatting'],
    formatting2: TextSegment['formatting']
  ): boolean {
    const keys1 = Object.keys(formatting1);
    const keys2 = Object.keys(formatting2);
    
    if (keys1.length !== keys2.length) {
      return false;
    }
    
    for (const key of keys1) {
      if ((formatting1 as any)[key] !== (formatting2 as any)[key]) {
        return false;
      }
    }
    
    return true;
  }

  private static getAnnotationTypeFromFormatting(
    formatting: TextSegment['formatting'],
    defaultType: 'rectangle' | 'highlight' | 'underline' | 'strikethrough'
  ): 'rectangle' | 'highlight' | 'underline' | 'strikethrough' {
    if (formatting.strikethrough) {
      return 'strikethrough';
    } else if (formatting.underline) {
      return 'underline';
    } else if (formatting.backgroundColor) {
      return 'highlight';
    }
    
    return defaultType;
  }

  private static convertToQueryFormatting(
    formatting: TextSegment['formatting']
  ): import('./types').SearchQuery['formatting'] {
    const result: import('./types').SearchQuery['formatting'] = {};
    
    if (formatting.color) {
      result.color = formatting.color;
    }
    
    if (formatting.backgroundColor) {
      result.backgroundColor = formatting.backgroundColor;
    }
    
    const decorations: ('underline' | 'strikethrough')[] = [];
    if (formatting.underline) {
      decorations.push('underline');
    }
    if (formatting.strikethrough) {
      decorations.push('strikethrough');
    }
    
    if (decorations.length > 0) {
      result.decorations = decorations;
    }
    
    return result;
  }
}