export namespace domain {
	
	export class LogRetentionSettings {
	    maxTotalBytes: number;
	    maxEntries: number;
	
	    static createFrom(source: any = {}) {
	        return new LogRetentionSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.maxTotalBytes = source["maxTotalBytes"];
	        this.maxEntries = source["maxEntries"];
	    }
	}
	export class AppSettings {
	    autoCheckUpdate: boolean;
	    autoResubscribe: boolean;
	    multiSubjectSubscribe: boolean;
	    maxReconnectTimes: number;
	    maxPayloadSize: number;
	    themeMode: string;
	    language: string;
	    logRetention: LogRetentionSettings;
	
	    static createFrom(source: any = {}) {
	        return new AppSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.autoCheckUpdate = source["autoCheckUpdate"];
	        this.autoResubscribe = source["autoResubscribe"];
	        this.multiSubjectSubscribe = source["multiSubjectSubscribe"];
	        this.maxReconnectTimes = source["maxReconnectTimes"];
	        this.maxPayloadSize = source["maxPayloadSize"];
	        this.themeMode = source["themeMode"];
	        this.language = source["language"];
	        this.logRetention = this.convertValues(source["logRetention"], LogRetentionSettings);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ConnectionInput {
	    id?: string;
	    name: string;
	    url: string;
	    authMode?: string;
	    username?: string;
	    password?: string;
	    token?: string;
	    certFile?: string;
	    keyFile?: string;
	    caFile?: string;
	    nkeyOrSeed?: string;
	    credsFile?: string;
	    group?: string;
	    description?: string;
	
	    static createFrom(source: any = {}) {
	        return new ConnectionInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.url = source["url"];
	        this.authMode = source["authMode"];
	        this.username = source["username"];
	        this.password = source["password"];
	        this.token = source["token"];
	        this.certFile = source["certFile"];
	        this.keyFile = source["keyFile"];
	        this.caFile = source["caFile"];
	        this.nkeyOrSeed = source["nkeyOrSeed"];
	        this.credsFile = source["credsFile"];
	        this.group = source["group"];
	        this.description = source["description"];
	    }
	}
	export class ConnectionProfile {
	    id: string;
	    name: string;
	    url: string;
	    authMode?: string;
	    username?: string;
	    password?: string;
	    token?: string;
	    certFile?: string;
	    keyFile?: string;
	    caFile?: string;
	    nkeyOrSeed?: string;
	    credsFile?: string;
	    group?: string;
	    description?: string;
	    connected: boolean;
	    lastError?: string;
	    // Go type: time
	    lastConnectedAt?: any;
	    // Go type: time
	    updatedAt: any;
	
	    static createFrom(source: any = {}) {
	        return new ConnectionProfile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.url = source["url"];
	        this.authMode = source["authMode"];
	        this.username = source["username"];
	        this.password = source["password"];
	        this.token = source["token"];
	        this.certFile = source["certFile"];
	        this.keyFile = source["keyFile"];
	        this.caFile = source["caFile"];
	        this.nkeyOrSeed = source["nkeyOrSeed"];
	        this.credsFile = source["credsFile"];
	        this.group = source["group"];
	        this.description = source["description"];
	        this.connected = source["connected"];
	        this.lastError = source["lastError"];
	        this.lastConnectedAt = this.convertValues(source["lastConnectedAt"], null);
	        this.updatedAt = this.convertValues(source["updatedAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ConsumerDeleteRequest {
	    connectionId: string;
	    streamName: string;
	    consumerName: string;
	
	    static createFrom(source: any = {}) {
	        return new ConsumerDeleteRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.streamName = source["streamName"];
	        this.consumerName = source["consumerName"];
	    }
	}
	export class ConsumerFetchRequest {
	    connectionId: string;
	    streamName: string;
	    consumerName: string;
	    batchSize: number;
	    maxWaitMs: number;
	
	    static createFrom(source: any = {}) {
	        return new ConsumerFetchRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.streamName = source["streamName"];
	        this.consumerName = source["consumerName"];
	        this.batchSize = source["batchSize"];
	        this.maxWaitMs = source["maxWaitMs"];
	    }
	}
	export class MessageRecord {
	    id: string;
	    connectionId: string;
	    subscriptionId?: string;
	    subscriptionPattern?: string;
	    direction: string;
	    kind: string;
	    subject: string;
	    reply?: string;
	    payload: string;
	    payloadBase64?: string;
	    payloadEncoding?: string;
	    headers?: {[key: string]: string[]};
	    size: number;
	    jetStream: boolean;
	    jetStreamStream?: string;
	    jetStreamConsumer?: string;
	    jetStreamSequence?: number;
	    correlationId?: string;
	    relatedMessageId?: string;
	    replaySourceMessageId?: string;
	    requestDurationMs?: number;
	    requestTimeoutMs?: number;
	    requestStatus?: string;
	    errorMessage?: string;
	    ackEligible: boolean;
	    ackState?: string;
	    // Go type: time
	    receivedAt: any;
	
	    static createFrom(source: any = {}) {
	        return new MessageRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.connectionId = source["connectionId"];
	        this.subscriptionId = source["subscriptionId"];
	        this.subscriptionPattern = source["subscriptionPattern"];
	        this.direction = source["direction"];
	        this.kind = source["kind"];
	        this.subject = source["subject"];
	        this.reply = source["reply"];
	        this.payload = source["payload"];
	        this.payloadBase64 = source["payloadBase64"];
	        this.payloadEncoding = source["payloadEncoding"];
	        this.headers = source["headers"];
	        this.size = source["size"];
	        this.jetStream = source["jetStream"];
	        this.jetStreamStream = source["jetStreamStream"];
	        this.jetStreamConsumer = source["jetStreamConsumer"];
	        this.jetStreamSequence = source["jetStreamSequence"];
	        this.correlationId = source["correlationId"];
	        this.relatedMessageId = source["relatedMessageId"];
	        this.replaySourceMessageId = source["replaySourceMessageId"];
	        this.requestDurationMs = source["requestDurationMs"];
	        this.requestTimeoutMs = source["requestTimeoutMs"];
	        this.requestStatus = source["requestStatus"];
	        this.errorMessage = source["errorMessage"];
	        this.ackEligible = source["ackEligible"];
	        this.ackState = source["ackState"];
	        this.receivedAt = this.convertValues(source["receivedAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ConsumerFetchResponse {
	    messages: MessageRecord[];
	
	    static createFrom(source: any = {}) {
	        return new ConsumerFetchResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.messages = this.convertValues(source["messages"], MessageRecord);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ConsumerInfo {
	    name: string;
	    streamName: string;
	    ackPolicy: string;
	    deliverPolicy: string;
	    filterSubject?: string;
	    deliverSubject?: string;
	    isPullMode: boolean;
	    numPending: number;
	    numWaiting: number;
	    numAckPending: number;
	    maxDeliver?: number;
	    ackWait?: number;
	    maxAckPending?: number;
	
	    static createFrom(source: any = {}) {
	        return new ConsumerInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.streamName = source["streamName"];
	        this.ackPolicy = source["ackPolicy"];
	        this.deliverPolicy = source["deliverPolicy"];
	        this.filterSubject = source["filterSubject"];
	        this.deliverSubject = source["deliverSubject"];
	        this.isPullMode = source["isPullMode"];
	        this.numPending = source["numPending"];
	        this.numWaiting = source["numWaiting"];
	        this.numAckPending = source["numAckPending"];
	        this.maxDeliver = source["maxDeliver"];
	        this.ackWait = source["ackWait"];
	        this.maxAckPending = source["maxAckPending"];
	    }
	}
	export class ConsumerUpsertRequest {
	    connectionId: string;
	    streamName: string;
	    name: string;
	    ackPolicy: string;
	    deliverPolicy: string;
	    filterSubject?: string;
	    deliverSubject?: string;
	    maxDeliver?: number;
	    ackWait?: number;
	    maxAckPending?: number;
	
	    static createFrom(source: any = {}) {
	        return new ConsumerUpsertRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.streamName = source["streamName"];
	        this.name = source["name"];
	        this.ackPolicy = source["ackPolicy"];
	        this.deliverPolicy = source["deliverPolicy"];
	        this.filterSubject = source["filterSubject"];
	        this.deliverSubject = source["deliverSubject"];
	        this.maxDeliver = source["maxDeliver"];
	        this.ackWait = source["ackWait"];
	        this.maxAckPending = source["maxAckPending"];
	    }
	}
	export class ExportConnectionsFileResponse {
	    path: string;
	    count: number;
	    masked: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ExportConnectionsFileResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.count = source["count"];
	        this.masked = source["masked"];
	    }
	}
	export class ExportConnectionsRequest {
	    maskSensitive: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ExportConnectionsRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.maskSensitive = source["maskSensitive"];
	    }
	}
	export class ExportConnectionsResponse {
	    content: string;
	    count: number;
	    masked: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ExportConnectionsResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.content = source["content"];
	        this.count = source["count"];
	        this.masked = source["masked"];
	    }
	}
	export class ImportConnectionsFromFileRequest {
	    overwrite: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ImportConnectionsFromFileRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.overwrite = source["overwrite"];
	    }
	}
	export class ImportConnectionsRequest {
	    content: string;
	    overwrite: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ImportConnectionsRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.content = source["content"];
	        this.overwrite = source["overwrite"];
	    }
	}
	export class ImportConnectionsResponse {
	    imported: number;
	    skipped: number;
	    connections: ConnectionProfile[];
	    sourcePath?: string;
	
	    static createFrom(source: any = {}) {
	        return new ImportConnectionsResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.imported = source["imported"];
	        this.skipped = source["skipped"];
	        this.connections = this.convertValues(source["connections"], ConnectionProfile);
	        this.sourcePath = source["sourcePath"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class ManagedResourceFile {
	    name: string;
	    path: string;
	    relativePath: string;
	    size: number;
	    // Go type: time
	    updatedAt: any;
	    reused?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ManagedResourceFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.relativePath = source["relativePath"];
	        this.size = source["size"];
	        this.updatedAt = this.convertValues(source["updatedAt"], null);
	        this.reused = source["reused"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class MessageActionRequest {
	    messageId: string;
	
	    static createFrom(source: any = {}) {
	        return new MessageActionRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.messageId = source["messageId"];
	    }
	}
	
	export class PublishRequest {
	    connectionId: string;
	    subject: string;
	    payload: string;
	    payloadBase64?: string;
	    payloadEncoding?: string;
	    headers?: {[key: string]: string};
	    useJetStream: boolean;
	    useMsgId?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PublishRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.subject = source["subject"];
	        this.payload = source["payload"];
	        this.payloadBase64 = source["payloadBase64"];
	        this.payloadEncoding = source["payloadEncoding"];
	        this.headers = source["headers"];
	        this.useJetStream = source["useJetStream"];
	        this.useMsgId = source["useMsgId"];
	    }
	}
	export class ReplyRequest {
	    connectionId: string;
	    replySubject: string;
	    payload: string;
	    payloadBase64?: string;
	    payloadEncoding?: string;
	    headers?: {[key: string]: string};
	    requestId?: string;
	    sourceMessageId?: string;
	
	    static createFrom(source: any = {}) {
	        return new ReplyRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.replySubject = source["replySubject"];
	        this.payload = source["payload"];
	        this.payloadBase64 = source["payloadBase64"];
	        this.payloadEncoding = source["payloadEncoding"];
	        this.headers = source["headers"];
	        this.requestId = source["requestId"];
	        this.sourceMessageId = source["sourceMessageId"];
	    }
	}
	export class RepublishMessageRequest {
	    messageId: string;
	    subject: string;
	    payload: string;
	    payloadBase64?: string;
	    payloadEncoding?: string;
	    headers?: {[key: string]: string};
	    useJetStream: boolean;
	
	    static createFrom(source: any = {}) {
	        return new RepublishMessageRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.messageId = source["messageId"];
	        this.subject = source["subject"];
	        this.payload = source["payload"];
	        this.payloadBase64 = source["payloadBase64"];
	        this.payloadEncoding = source["payloadEncoding"];
	        this.headers = source["headers"];
	        this.useJetStream = source["useJetStream"];
	    }
	}
	export class RepublishMessageResponse {
	    message: MessageRecord;
	
	    static createFrom(source: any = {}) {
	        return new RepublishMessageResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.message = this.convertValues(source["message"], MessageRecord);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class RequestMessageRequest {
	    connectionId: string;
	    subject: string;
	    payload: string;
	    payloadBase64?: string;
	    payloadEncoding?: string;
	    headers?: {[key: string]: string};
	    requestId?: string;
	    replaySourceMessageId?: string;
	    timeoutMs: number;
	
	    static createFrom(source: any = {}) {
	        return new RequestMessageRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.subject = source["subject"];
	        this.payload = source["payload"];
	        this.payloadBase64 = source["payloadBase64"];
	        this.payloadEncoding = source["payloadEncoding"];
	        this.headers = source["headers"];
	        this.requestId = source["requestId"];
	        this.replaySourceMessageId = source["replaySourceMessageId"];
	        this.timeoutMs = source["timeoutMs"];
	    }
	}
	export class RequestMessageResponse {
	    message: MessageRecord;
	
	    static createFrom(source: any = {}) {
	        return new RequestMessageResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.message = this.convertValues(source["message"], MessageRecord);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SetSubscriptionStateRequest {
	    subscriptionId: string;
	    active: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SetSubscriptionStateRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.subscriptionId = source["subscriptionId"];
	        this.active = source["active"];
	    }
	}
	export class SubscriptionInfo {
	    id: string;
	    connectionId: string;
	    subject: string;
	    queueGroup?: string;
	    active: boolean;
	    messageCount: number;
	    // Go type: time
	    createdAt: any;
	
	    static createFrom(source: any = {}) {
	        return new SubscriptionInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.connectionId = source["connectionId"];
	        this.subject = source["subject"];
	        this.queueGroup = source["queueGroup"];
	        this.active = source["active"];
	        this.messageCount = source["messageCount"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Snapshot {
	    // Go type: time
	    generatedAt: any;
	    connections: ConnectionProfile[];
	    subscriptions: SubscriptionInfo[];
	    messages: MessageRecord[];
	
	    static createFrom(source: any = {}) {
	        return new Snapshot(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.generatedAt = this.convertValues(source["generatedAt"], null);
	        this.connections = this.convertValues(source["connections"], ConnectionProfile);
	        this.subscriptions = this.convertValues(source["subscriptions"], SubscriptionInfo);
	        this.messages = this.convertValues(source["messages"], MessageRecord);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class StreamDeleteRequest {
	    connectionId: string;
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new StreamDeleteRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.name = source["name"];
	    }
	}
	export class StreamInfo {
	    name: string;
	    subjects: string[];
	    messages: number;
	    bytes: number;
	    consumers: number;
	    storage: string;
	    replicas: number;
	
	    static createFrom(source: any = {}) {
	        return new StreamInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.subjects = source["subjects"];
	        this.messages = source["messages"];
	        this.bytes = source["bytes"];
	        this.consumers = source["consumers"];
	        this.storage = source["storage"];
	        this.replicas = source["replicas"];
	    }
	}
	export class StreamUpsertRequest {
	    connectionId: string;
	    name: string;
	    subjects: string[];
	    storage: string;
	    replicas: number;
	    maxAge?: number;
	    maxMsgs?: number;
	    maxBytes?: number;
	    maxMsgSize?: number;
	    retention?: string;
	    discard?: string;
	    duplicateWindow?: number;
	
	    static createFrom(source: any = {}) {
	        return new StreamUpsertRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.name = source["name"];
	        this.subjects = source["subjects"];
	        this.storage = source["storage"];
	        this.replicas = source["replicas"];
	        this.maxAge = source["maxAge"];
	        this.maxMsgs = source["maxMsgs"];
	        this.maxBytes = source["maxBytes"];
	        this.maxMsgSize = source["maxMsgSize"];
	        this.retention = source["retention"];
	        this.discard = source["discard"];
	        this.duplicateWindow = source["duplicateWindow"];
	    }
	}
	export class SubscribeRequest {
	    connectionId: string;
	    subject: string;
	    queueGroup?: string;
	
	    static createFrom(source: any = {}) {
	        return new SubscribeRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.subject = source["subject"];
	        this.queueGroup = source["queueGroup"];
	    }
	}
	
	export class UpdateDownloadResult {
	    path: string;
	    assetName: string;
	    latestVersion: string;
	    releaseUrl?: string;
	    downloadUrl?: string;
	    bytes: number;
	    // Go type: time
	    downloadedAt: any;
	
	    static createFrom(source: any = {}) {
	        return new UpdateDownloadResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.assetName = source["assetName"];
	        this.latestVersion = source["latestVersion"];
	        this.releaseUrl = source["releaseUrl"];
	        this.downloadUrl = source["downloadUrl"];
	        this.bytes = source["bytes"];
	        this.downloadedAt = this.convertValues(source["downloadedAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class UpdateInfo {
	    currentVersion: string;
	    latestVersion: string;
	    releaseFound: boolean;
	    hasUpdate: boolean;
	    hasPlatformAsset: boolean;
	    platform: string;
	    releaseUrl?: string;
	    downloadUrl?: string;
	    assetName?: string;
	    // Go type: time
	    publishedAt?: any;
	    releaseNotes?: string;
	
	    static createFrom(source: any = {}) {
	        return new UpdateInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.currentVersion = source["currentVersion"];
	        this.latestVersion = source["latestVersion"];
	        this.releaseFound = source["releaseFound"];
	        this.hasUpdate = source["hasUpdate"];
	        this.hasPlatformAsset = source["hasPlatformAsset"];
	        this.platform = source["platform"];
	        this.releaseUrl = source["releaseUrl"];
	        this.downloadUrl = source["downloadUrl"];
	        this.assetName = source["assetName"];
	        this.publishedAt = this.convertValues(source["publishedAt"], null);
	        this.releaseNotes = source["releaseNotes"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class UpdateState {
	    downloadedPackage?: UpdateDownloadResult;
	
	    static createFrom(source: any = {}) {
	        return new UpdateState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.downloadedPackage = this.convertValues(source["downloadedPackage"], UpdateDownloadResult);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class UpdateSubscriptionRequest {
	    subscriptionId: string;
	    subject: string;
	    queueGroup?: string;
	
	    static createFrom(source: any = {}) {
	        return new UpdateSubscriptionRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.subscriptionId = source["subscriptionId"];
	        this.subject = source["subject"];
	        this.queueGroup = source["queueGroup"];
	    }
	}

}

export namespace main {
	
	export class WindowState {
	    maximised: boolean;
	    minimised: boolean;
	    fullscreen: boolean;
	    normal: boolean;
	
	    static createFrom(source: any = {}) {
	        return new WindowState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.maximised = source["maximised"];
	        this.minimised = source["minimised"];
	        this.fullscreen = source["fullscreen"];
	        this.normal = source["normal"];
	    }
	}

}

