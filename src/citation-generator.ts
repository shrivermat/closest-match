import type { MatchResult, PageObject } from './types';

export interface CitationFormat {
  name: string;
  pattern: string;
  fields: string[];
}

export interface CitationData {
  title?: string;
  author?: string;
  organization?: string;
  year?: number;
  date?: string;
  url?: string;
  pageNumber?: number;
  accessDate?: string;
  doi?: string;
  isbn?: string;
  journal?: string;
  volume?: string;
  issue?: string;
}

export interface CitationResult {
  citation: string;
  format: string;
  matchText: string;
  pageNumber: number;
  docUID: string;
  timestamp: string;
}

export class CitationGenerator {
  private static readonly FORMATS: Record<string, CitationFormat> = {
    apa: {
      name: 'APA Style',
      pattern: '{author} ({year}). {title}. {organization}. Retrieved {accessDate}, from {url}',
      fields: ['author', 'year', 'title', 'organization', 'url', 'accessDate']
    },
    mla: {
      name: 'MLA Style',
      pattern: '{author}. "{title}." {organization}, {date}, {url}. Accessed {accessDate}.',
      fields: ['author', 'title', 'organization', 'date', 'url', 'accessDate']
    },
    chicago: {
      name: 'Chicago Style',
      pattern: '{author}. "{title}." {organization}. {date}. {url} (accessed {accessDate}).',
      fields: ['author', 'title', 'organization', 'date', 'url', 'accessDate']
    },
    harvard: {
      name: 'Harvard Style',
      pattern: '{author} ({year}) {title}, {organization}, viewed {accessDate}, <{url}>.',
      fields: ['author', 'year', 'title', 'organization', 'url', 'accessDate']
    },
    ieee: {
      name: 'IEEE Style',
      pattern: '{author}, "{title}," {organization}, {date}. [Online]. Available: {url}. [Accessed: {accessDate}].',
      fields: ['author', 'title', 'organization', 'date', 'url', 'accessDate']
    }
  };

  static generateCitation(
    match: MatchResult,
    pageObj: PageObject,
    citationData: Partial<CitationData>,
    format: keyof typeof CitationGenerator.FORMATS = 'apa'
  ): CitationResult {
    const formatConfig = CitationGenerator.FORMATS[format];
    if (!formatConfig) {
      throw new Error(`Unsupported citation format: ${format}`);
    }

    const defaultData: CitationData = {
      pageNumber: match.pageNumber,
      accessDate: new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
      year: new Date().getFullYear(),
      date: new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    };

    const mergedData = { ...defaultData, ...citationData };

    let citation = formatConfig.pattern;
    
    // Replace placeholders with actual data
    for (const field of formatConfig.fields) {
      const value = mergedData[field as keyof CitationData];
      const placeholder = `{${field}}`;
      
      if (value !== undefined) {
        citation = citation.replace(new RegExp(placeholder, 'g'), String(value));
      } else {
        // Remove placeholder if no data available
        citation = citation.replace(new RegExp(`\\s*${placeholder.replace(/[{}]/g, '\\$&')}\\s*`, 'g'), '');
      }
    }

    // Clean up extra spaces and punctuation
    citation = citation
      .replace(/\s+/g, ' ')
      .replace(/\s*,\s*,/g, ',')
      .replace(/\s*\.\s*\./g, '.')
      .replace(/^\s*,\s*/, '')
      .replace(/\s*,\s*$/, '')
      .trim();

    return {
      citation,
      format: formatConfig.name,
      matchText: match.text,
      pageNumber: match.pageNumber,
      docUID: match.docUID,
      timestamp: new Date().toISOString()
    };
  }

  static generateMultipleCitations(
    matches: MatchResult[],
    pageObjects: PageObject[],
    citationData: Partial<CitationData>,
    format: keyof typeof CitationGenerator.FORMATS = 'apa'
  ): CitationResult[] {
    const pageMap = new Map(pageObjects.map(p => [`${p.docUID}-${p.pageNumber}`, p]));
    
    return matches.map(match => {
      const pageObj = pageMap.get(`${match.docUID}-${match.pageNumber}`);
      if (!pageObj) {
        throw new Error(`Page object not found for match: ${match.docUID}-${match.pageNumber}`);
      }
      
      return CitationGenerator.generateCitation(match, pageObj, citationData, format);
    });
  }

  static generateBibliography(
    citations: CitationResult[],
    groupBy: 'document' | 'format' | 'none' = 'document'
  ): {
    bibliography: string;
    sections?: Array<{
      title: string;
      citations: CitationResult[];
      text: string;
    }>;
  } {
    if (groupBy === 'none') {
      const sortedCitations = citations.sort((a, b) => 
        a.citation.localeCompare(b.citation)
      );
      
      return {
        bibliography: sortedCitations.map(c => c.citation).join('\n\n')
      };
    }

    const groups = new Map<string, CitationResult[]>();
    
    citations.forEach(citation => {
      const key = groupBy === 'document' ? citation.docUID : citation.format;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(citation);
    });

    const sections = Array.from(groups.entries()).map(([key, groupCitations]) => {
      const sortedCitations = groupCitations.sort((a, b) => 
        a.pageNumber - b.pageNumber || a.citation.localeCompare(b.citation)
      );
      
      return {
        title: groupBy === 'document' ? `Document: ${key}` : `Format: ${key}`,
        citations: sortedCitations,
        text: sortedCitations.map(c => c.citation).join('\n\n')
      };
    });

    const bibliography = sections.map(section => 
      `${section.title}\n${'='.repeat(section.title.length)}\n\n${section.text}`
    ).join('\n\n\n');

    return { bibliography, sections };
  }

  static extractCitationMetadata(
    url: string,
    title?: string
  ): Promise<Partial<CitationData>> {
    return new Promise((resolve) => {
      try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname;
        
        let organization = domain;
        let author = 'Anonymous';
        
        // Extract organization from common domains
        if (domain.includes('gov')) {
          organization = 'Government Document';
        } else if (domain.includes('edu')) {
          organization = 'Academic Institution';
        } else if (domain.includes('org')) {
          organization = 'Organization';
        } else if (domain.includes('com')) {
          organization = 'Commercial Source';
        }
        
        // Try to extract more specific organization name
        const domainParts = domain.split('.');
        if (domainParts.length >= 2) {
          const mainDomain = domainParts[domainParts.length - 2];
          organization = mainDomain.charAt(0).toUpperCase() + mainDomain.slice(1);
        }

        resolve({
          url,
          title: title || 'Untitled Document',
          organization,
          author,
          accessDate: new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })
        });
      } catch (error) {
        resolve({
          url,
          title: title || 'Untitled Document',
          organization: 'Unknown Source',
          author: 'Anonymous',
          accessDate: new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })
        });
      }
    });
  }

  static getAvailableFormats(): Array<{
    key: string;
    name: string;
    example: string;
  }> {
    return Object.entries(CitationGenerator.FORMATS).map(([key, format]) => ({
      key,
      name: format.name,
      example: CitationGenerator.generateExampleCitation(key as keyof typeof CitationGenerator.FORMATS)
    }));
  }

  private static generateExampleCitation(format: keyof typeof CitationGenerator.FORMATS): string {
    const exampleData: CitationData = {
      author: 'Smith, J.',
      title: 'Sample Document Analysis',
      organization: 'Research Institute',
      year: 2023,
      date: 'January 15, 2023',
      url: 'https://example.com/document.pdf',
      accessDate: 'March 20, 2024'
    };

    const formatConfig = CitationGenerator.FORMATS[format];
    let example = formatConfig.pattern;
    
    for (const field of formatConfig.fields) {
      const value = exampleData[field as keyof CitationData];
      const placeholder = `{${field}}`;
      
      if (value !== undefined) {
        example = example.replace(new RegExp(placeholder, 'g'), String(value));
      }
    }

    return example;
  }

  static exportCitations(
    citations: CitationResult[],
    format: 'json' | 'csv' | 'txt' | 'bibtex' = 'json'
  ): string {
    switch (format) {
      case 'json':
        return JSON.stringify(citations, null, 2);
        
      case 'csv':
        const headers = ['Citation', 'Format', 'Match Text', 'Page Number', 'Document UID', 'Timestamp'];
        const rows = citations.map(c => [
          `"${c.citation.replace(/"/g, '""')}"`,
          c.format,
          `"${c.matchText.replace(/"/g, '""')}"`,
          c.pageNumber.toString(),
          c.docUID,
          c.timestamp
        ]);
        return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
        
      case 'txt':
        return citations.map((c, i) => 
          `${i + 1}. ${c.citation}\n   Match: "${c.matchText}" (Page ${c.pageNumber}, ${c.docUID})\n   Generated: ${new Date(c.timestamp).toLocaleString()}`
        ).join('\n\n');
        
      case 'bibtex':
        return citations.map((c, i) => {
          const key = `ref${i + 1}`;
          const title = c.matchText.substring(0, 50) + (c.matchText.length > 50 ? '...' : '');
          return `@misc{${key},\n  title={${title}},\n  note={${c.citation}},\n  year={${new Date(c.timestamp).getFullYear()}}\n}`;
        }).join('\n\n');
        
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }
}