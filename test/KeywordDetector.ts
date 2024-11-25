import * as fs from 'fs'

export class KeywordDetector {
  private keywords: string[] = []
  private configPath: string

  constructor(configPath: string) {
    this.configPath = configPath
    this.loadKeywords()
  }

  public loadKeywords(): void {
    try {
      const config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'))
      this.keywords = config.Adkeywords || []
      console.log('关键词重载成功:', this.keywords)
    } catch (error) {
      console.error('加载关键词配置失败:', error)
    }
  }

  public detect(message: string): boolean {
    return this.keywords.some(keyword => message.includes(keyword))
  }

  public getMatchedKeywords(message: string): string[] {
    return this.keywords.filter(keyword => message.includes(keyword))
  }

  public getCurrentKeywords(): string[] {
    return [...this.keywords]
  }
} 