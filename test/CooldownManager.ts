export class CooldownManager {
  private cooldownTime: number // 冷却时间（秒）
  private lastSendTime: Map<number, number> // 用户ID -> 上次发送时间的映射

  constructor(cooldownTime: number) {
    this.cooldownTime = cooldownTime
    this.lastSendTime = new Map()
  }

  // 检查用户是否可以发送消息
  canSendMessage(userId: number): boolean {
    const lastTime = this.lastSendTime.get(userId)
    if (!lastTime) return true

    const now = Date.now()
    return (now - lastTime) / 1000 >= this.cooldownTime
  }

  // 获取剩余冷却时间（秒）
  getRemainingTime(userId: number): number {
    const lastTime = this.lastSendTime.get(userId)
    if (!lastTime) return 0

    const now = Date.now()
    const elapsed = (now - lastTime) / 1000
    const remaining = this.cooldownTime - elapsed

    return remaining > 0 ? Math.ceil(remaining) : 0
  }

  // 更新用户的最后发送时间
  updateLastSendTime(userId: number): void {
    this.lastSendTime.set(userId, Date.now())
  }
} 