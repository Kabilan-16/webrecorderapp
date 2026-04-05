const BASE_URL="http://localhost:4000";

export class ApiError extends Error {
    constructor(message,{status=0,endpoint="",details=null}={}){
        super(message);
        this.name="ApiError";
        this.status=status;
        this.endpoint=endpoint;
        this.details=details;
    }
}

export class VideoApi {
    constructor(baseUrl=BASE_URL){
        this.baseUrl=baseUrl;
    }
    async _safeJson(res){
        try{
            return await res.json();
        }
        catch{
            return null;
        }
    }
    async _requestJson(endpoint,options={}){
        const url=`${this.baseUrl}${endpoint}`;
        let res;
        try{
            res=await fetch(url,options);
        }
        catch(err){
            throw new ApiError(`Network error while calling ${endpoint}`,{
                endpoint,
                details: err.message,
            });
        }
        const body=await this._safeJson(res);
        if (!res.ok){
            throw new ApiError(body?.error||body?.message||`Request failed ${res.status}`,
                {
                    status: res.status,
                    endpoint,
                    details: body,
                }
            );
        }
        return body;
    }

    //Start a new session on the backend
    async startSession(){
        const data=await this._requestJson("/api/sessions",{method:"POST"}) ;
        const {sessionId}=data||{};
        if(!sessionId){
            throw new ApiError("Malformed response from server: missing session ID",{
                endpoint: "/api/sessions",
                details: data,
            });
        }
        return sessionId;
    }

    //Upload a single blob chunk to the backend
    async uploadChunk(sessionId,chunkIndex,blob){
        const form = new FormData();
        form.append("chunk",blob,`chunk_${chunkIndex}.webm`);

        return this._requestJson(`/api/sessions/${sessionId}/chunks/${chunkIndex}`,{
            method:"POST",
            body: form,
        });
    }

    //Assemble all chunks into a single video file on the backend
    async finalizeSession(sessionId){
        const data=await this._requestJson(`/api/sessions/${sessionId}/finalize`,{
            method:"POST",
        });
        if(!data?.downloadUrl || !data?.filename){
            throw new ApiError("Malformed finalize response",{
                endpoint: `/api/sessions/${sessionId}/finalize`,
                details: data,
            });
        }
        return data;
    }

}

export const videoApi = new VideoApi();    