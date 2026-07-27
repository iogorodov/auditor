// Единственное, что нужно xlsx-коду из utils исходного проекта.
export function promisify<T>(f: (callback: (error: Error | null, value: T) => void) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    f((error: Error | null, value: T) => {
      if (error) {
        reject(error)
      } else {
        resolve(value)
      }
    })
  })
}
