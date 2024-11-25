export class RecallCountManager {
  private recallCounts: Map<string, number> // groupId_userId -> 撤回次数
  private lastRecallTimes: Map<string, number[]> // groupId_userId -> 撤回时间数组
  private readonly MAX_TEXT_RECALLS: number // 文本消息最大撤回次数
  private readonly MAX_IMAGE_RECALLS: number // 图片消息最大撤回次数
  private readonly TIME_WINDOW: number // 24小时的毫秒数

  constructor(maxTextRecalls: number, maxImageRecalls: number, timeWindow: number) {
    this.recallCounts = new Map()
    this.lastRecallTimes = new Map()
    this.MAX_TEXT_RECALLS = maxTextRecalls
    this.MAX_IMAGE_RECALLS = maxImageRecalls
    this.TIME_WINDOW = timeWindow
  }

  private getKey(groupId: number, userId: number, isImage: boolean): string {
    return `${groupId}_${userId}_${isImage ? 'image' : 'text'}`
  }

  // 记录一次撤回
  public addRecall(groupId: number, userId: number, isImage: boolean): boolean {
    const key = this.getKey(groupId, userId, isImage)
    const now = Date.now()

    // 获取用户的撤回时间记录
    let times = this.lastRecallTimes.get(key) || []
    
    // 清理24小时之前的记录
    times = times.filter(time => now - time < this.TIME_WINDOW)
    
    // 添加新的撤回时间
    times.push(now)
    this.lastRecallTimes.set(key, times)

    // 更新撤回次数
    const count = times.length
    this.recallCounts.set(key, count)

    // 根据消息类型判断是否达到阈值
    const maxRecalls = isImage ? this.MAX_IMAGE_RECALLS : this.MAX_TEXT_RECALLS
    return count >= maxRecalls
  }

  // 获取用户的撤回次数
  public getRecallCount(groupId: number, userId: number, isImage: boolean): number {
    const key = this.getKey(groupId, userId, isImage)
    const now = Date.now()
    
    // 获取并清理过期的记录
    const times = this.lastRecallTimes.get(key) || []
    const validTimes = times.filter(time => now - time < this.TIME_WINDOW)
    
    if (validTimes.length !== times.length) {
      this.lastRecallTimes.set(key, validTimes)
      this.recallCounts.set(key, validTimes.length)
    }

    return validTimes.length
  }

  // 重置用户的撤回记录
  public resetRecalls(groupId: number, userId: number): void {
    // 同时重置图片和文本的记录
    const imageKey = this.getKey(groupId, userId, true)
    const textKey = this.getKey(groupId, userId, false)
    
    this.recallCounts.delete(imageKey)
    this.recallCounts.delete(textKey)
    this.lastRecallTimes.delete(imageKey)
    this.lastRecallTimes.delete(textKey)
  }

  // 获取最大撤回次数
  public getMaxRecalls(isImage: boolean): number {
    return isImage ? this.MAX_IMAGE_RECALLS : this.MAX_TEXT_RECALLS
  }
} 