(()=>{"use strict";var e={3244:(e,r,t)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.removeExt=r.merge=r.resolve=r.resolver=r.getName=r.getDir=r.normalize=r.PathResolver=r.resolvePath=void 0;const o=t(1017);var l=t(1017);Object.defineProperty(r,"resolvePath",{enumerable:!0,get:function(){return l.resolve}});class a{constructor(e){this.rootPath=(0,r.normalize)((0,o.resolve)(e))}relative(e){return(0,r.normalize)((0,o.relative)(this.rootPath,(0,r.normalize)(e)))}relativeList(e){return e.map((e=>this.relative(e)))}includes(e){return 0===(0,r.normalize)(e).indexOf(this.rootPath)}resolve(...e){return(0,r.normalize)((0,o.resolve)(this.rootPath,...e.filter(Boolean).map((e=>e.replace(/^\/+/,"")))))}resolveList(e){return e.map((e=>this.resolve(e)))}dir(){return(0,r.resolver)((0,r.getDir)(this.rootPath))}res(...e){return(0,r.resolver)(this.resolve(...e))}}r.PathResolver=a,r.normalize=e=>(null==e?void 0:e.replace(/\\/g,"/"))||"",r.getDir=e=>(0,r.normalize)(e).replace(/\/[^/]+\/?$/,""),r.getName=e=>(0,o.basename)((0,r.normalize)(e)),r.resolver=e=>new a(e),r.resolve=e=>(0,r.normalize)((0,o.resolve)(e)),r.merge=(...e)=>(0,r.normalize)((0,o.join)(...e)),r.removeExt=e=>null==e?void 0:e.replace(/\.([^/]+)$/,"")},1017:e=>{e.exports=require("path")}},r={},t=function t(o){var l=r[o];if(void 0!==l)return l.exports;var a=r[o]={exports:{}};return e[o](a,a.exports,t),a.exports}(3244);module.exports=t})();