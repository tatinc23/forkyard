import json,sys,subprocess,os
src=sys.argv[1]; d=json.load(open(f'out/{src}/frames.json')); fr=d['frames']
t0=fr[0]['t']
def at(t):
    best=fr[0]
    for f in fr:
        if f['t']<=t: best=f
        else: break
    return best['f']
marks=d['marks']
out=[]
for spec in sys.argv[2:]:
    name,phase,off=spec.split(':')
    m=[x for x in marks if x['name']==name and x['phase']==phase][0]
    f=at(m['t']+float(off)); out.append(f); print(spec,f)
os.makedirs('work/peek',exist_ok=True)
files=[f'out/{src}/frames/{f}' for f in out]
# montage 2 cols
args=['/usr/local/bin/ffmpeg','-y','-loglevel','error']
for f in files: args+=['-i',f]
n=len(files); cols=2; rows=(n+1)//2
inp=''.join(f'[{i}:v]scale=960:540[s{i}];' for i in range(n))
inp+=''.join(f'[s{i}]' for i in range(n))+f'xstack=inputs={n}:layout='+'|'.join(f'{(i%cols)*960}_{(i//cols)*540}' for i in range(n))+'[o]'
args+=['-filter_complex',inp,'-map','[o]','work/peek/sheet.png']
subprocess.run(args,check=True)
