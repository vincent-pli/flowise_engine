import 'reflect-metadata'
import path from 'path'
import { DataSource } from 'typeorm'
import { ChatMessage } from './entity/ChatMessage'
import { Credential } from './entity/Credential'
import { getUserHome } from './utils'

let appDataSource: DataSource

const DBENTITIES = [ChatMessage, Credential]


export const initCredential = async (credentialRecords: any[]) => {
    const credentials: any[] = []
    for ( const credentialObj of credentialRecords ) {
        const newCredential = new Credential()
        Object.assign(newCredential, credentialObj)
        const credential = appDataSource.getRepository(Credential).create(newCredential)
        credentials.push(credential)
    }


    await appDataSource.getRepository(Credential).save(credentials)
}

const initSQLLite = () => {
    const homePath = process.env.DATABASE_PATH ?? path.join(getUserHome(), '.starchain')
    console.log('sqlite.path', homePath)
    appDataSource = new DataSource({
        type: 'sqlite',
        database: path.resolve(homePath, 'database.sqlite'),
        synchronize: true,
        entities: DBENTITIES,
        migrations: []
    })
}

const initPostgre = () => {
    let pgHost = process.env.DB_PG_HOST
    let pgPort = parseInt(process.env.DB_PG_PORT ? process.env.DB_PG_PORT : '5432')
    let pgUser = process.env.DB_PG_USER
    let pgPwd = process.env.DB_PG_PWD
    let pgDatabase = process.env.DB_PG_DATABASE
    let pgSchema = process.env.DB_PG_SCHEMA
    appDataSource = new DataSource({
        type: 'postgres',
        host: pgHost,
        port: pgPort,
        username: pgUser,
        password: pgPwd,
        database: pgDatabase,
        schema: pgSchema,
        installExtensions: true,
        connectTimeoutMS: 2000,
        maxQueryExecutionTime: 3000,
        poolSize: 30,
        synchronize: true,
        dropSchema: false,
        cache: false,
        entities: DBENTITIES,
        migrations: [],
        poolErrorHandler: (err: any) => {
            console.log(
                'Make sure env variables DB_PG_HOST,DB_PG_PORT,DB_PG_USER,DB_PG_PWD,DB_PG_DATABASE,DB_PG_SCHEMA in file .env are correct'
            )
            console.log('Connect postgres error', err)
        }
    })
}

export const init = async (): Promise<void> => {
    const runtime = process.env.NODE_ENV === 'production'
    if (runtime) {
        console.log('current runtime is', process.env.NODE_ENV, 'and use postgre as DB')
        initPostgre()
    } else {
        console.log('current runtime is', process.env.NODE_ENV, 'and use SQLLite as DB')
        initSQLLite()
    }
}

export function getDataSource(): DataSource {
    if (appDataSource === undefined) {
        init()
    }
    return appDataSource
}
