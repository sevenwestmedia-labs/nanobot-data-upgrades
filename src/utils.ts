export function mapObject<
    T extends { [key: string]: FromKeyType },
    FromKeyType,
    ToKeyType
>(obj: T, trans: (o: FromKeyType) => ToKeyType): { [P in keyof T]: ToKeyType } {
    const newObj = {} as { [P in keyof T]: ToKeyType }
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            const keyValue: FromKeyType = obj[key] as any
            newObj[key] = trans(keyValue)
        }
    }
    return newObj
}
