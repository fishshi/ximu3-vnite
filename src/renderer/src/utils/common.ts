export function formatTimeToChinese(time: number): string {
  const hours = Math.floor(time / 3600000)
  const minutes = Math.floor((time % 3600000) / 60000)
  const seconds = Math.floor((time % 60000) / 1000)

  if (hours >= 1) {
    const fractionalHours = (time / 3600000).toFixed(1)
    return `${fractionalHours} 小时`
  } else if (minutes >= 1) {
    return `${minutes} 分钟`
  } else {
    return `${seconds} 秒`
  }
}

export function formatDateToChinese(dateString: string): string {
  const date = new Date(dateString)

  // 获取年、月、日
  const year = date.getFullYear()
  const month = date.getMonth() + 1 // 月份从0开始，所以需要加1
  const day = date.getDate()

  // 格式化为中文日期格式
  return `${year}年${month}月${day}日`
}

export function formatDateToISO(dateString: string): string {
  const date = new Date(dateString)

  // 获取年、月、日
  const year = date.getFullYear()
  const month = date.getMonth() + 1 // 月份从0开始，所以需要加1
  const day = date.getDate()

  // 格式化为日期格式
  return `${year}-${month}-${day}`
}

export function formatPlayStatusToChinese(status: string): string {
  switch (status) {
    case 'unplayed':
      return '未开始'
    case 'playing':
      return '游玩中'
    case 'finished':
      return '已完成'
    case 'multiple':
      return '多周目'
    case 'shelved':
      return '搁置中'
    default:
      return '未知'
  }
}
