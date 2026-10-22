// Screen-space labels stay attached to model-space anchors while orbiting.
export class TankSceneLabels{
  constructor(host,THREE){
    this.host=host;this.THREE=THREE;if(getComputedStyle(host).position==='static')host.style.position='relative';
    this.root=document.createElement('div');this.root.className='tank-scene-labels';this.root.style.cssText='position:absolute;inset:0;pointer-events:none;overflow:hidden';
    this.lines=document.createElementNS('http://www.w3.org/2000/svg','svg');this.lines.style.cssText='position:absolute;inset:0;width:100%;height:100%;overflow:visible';this.root.append(this.lines);host.append(this.root);this.items=[];
  }
  update(labels,revision=''){
    for(const item of this.items)item.node.remove();this.lines.replaceChildren();this.items=[];this.host.dataset.modelRevision=revision;
    for(const label of labels){
      const node=document.createElement('span');node.dataset.modelId=label.id;node.dataset.modelKind=label.kind;node.textContent=label.text||label.id;
      node.style.cssText=`position:absolute;max-width:240px;padding:4px 7px;font:11px/1.5 'Microsoft JhengHei',sans-serif;border-radius:5px;background:#fffffff0;border:1px solid ${label.kind==='weld'?'#c99a58':'#94b4a1'};color:${label.kind==='weld'?'#865321':'#315f49'};white-space:normal;box-shadow:0 1px 4px #263c3020`;
      const leader=document.createElementNS('http://www.w3.org/2000/svg','line');leader.setAttribute('stroke',label.kind==='weld'?'#bb8a48':'#799a85');leader.setAttribute('stroke-width','1');this.lines.append(leader);this.root.append(node);this.items.push({...label,node,leader});
    }
  }
  render(camera,group){
    const {width,height}=this.host.getBoundingClientRect();if(!width||!height)return;
    group.updateWorldMatrix(true,false);const boxes=[];
    for(const item of this.items){const v=new this.THREE.Vector3(...item.anchor).applyMatrix4(group.matrixWorld).project(camera),visible=v.z>=-1&&v.z<=1&&Math.abs(v.x)<1.3&&Math.abs(v.y)<1.3;
      item.node.hidden=!visible;item.leader.style.display=visible?'':'none';if(!visible)continue;
      const ax=(v.x+1)*width/2,ay=(1-v.y)*height/2,w=item.node.offsetWidth,h=item.node.offsetHeight;let x=Math.max(6,Math.min(width-w-6,ax+10)),y=Math.max(6,Math.min(height-h-6,ay-12));
      for(let i=0;i<18&&boxes.some(b=>x<b.x+b.w+4&&x+w+4>b.x&&y<b.y+b.h+4&&y+h+4>b.y);i++)y=Math.max(6,Math.min(height-h-6,ay+(i%2?1:-1)*Math.ceil((i+1)/2)*(h+5)));
      item.node.style.left=x+'px';item.node.style.top=y+'px';for(const [k,val] of Object.entries({x1:ax,y1:ay,x2:x,y2:y+h/2}))item.leader.setAttribute(k,String(val));boxes.push({x,y,w,h});
    }
  }
  select(id){for(const item of this.items){const selected=item.id===id;item.node.dataset.selected=String(selected);item.node.style.fontWeight=selected?'700':'400';item.node.style.background=selected?'#fff0cd':'#fffffff0';}}
  dispose(){this.root.remove();this.items=[];}
}
