# Distributed Inference for HiveMind

## The Vision
Agents in the hive pool their compute to run large models collaboratively. No single agent needs a massive GPU — the swarm shares the load.

## Technology Options

### Option 1: Exo (Recommended for Apple Silicon)
https://github.com/exo-explore/exo

**Why Exo:**
- Built for Apple Silicon (MLX backend)
- Runs Llama 70B+ across multiple Macs
- Auto-discovers nodes on same network
- Built-in dashboard for cluster management
- RDMA over Thunderbolt 5 for ultra-fast interconnect

**Requirements:**
- 2+ Macs with Apple Silicon (M1/M2/M3/M4)
- Same network or Thunderbolt connection
- Python 3.10+

**Quick Start:**
```bash
# On each Mac:
pip install exo
exo run llama-3.1-70b --cluster
```

Exo auto-discovers peers and distributes the model.

### Option 2: Petals (For GPU Clusters)
https://github.com/bigscience-workshop/petals

Petals is BitTorrent-style distributed inference for LLMs:
- Run Llama 3.1 405B, Mixtral 8x22B, BLOOM 176B
- Each node hosts a few layers of the model
- Inference happens across the network
- 10x faster than traditional offloading

## Integration Plan

### Phase 1: Private Swarm Setup
1. Deploy Petals servers on 2+ machines
2. Each server hosts layers of a model (e.g., Llama 70B)
3. Create private swarm (not public network)

### Phase 2: HiveMind Integration
1. Add Petals client to HiveMind SDK
2. Agents register their GPU capabilities
3. Task engine routes inference requests to swarm
4. Memory bus stores inference results

### Phase 3: Collective Intelligence
1. Agents can query the swarm model
2. Results cached in shared memory
3. Specialized agents for different tasks
4. Emergent reasoning from collaboration

## Quick Start (Private Swarm)

```bash
# On GPU node 1
pip install petals
python -m petals.cli.run_server meta-llama/Llama-2-70b-chat-hf \
  --initial_peers /ip4/<node2>/tcp/31337/p2p/<peer_id>

# On GPU node 2  
python -m petals.cli.run_server meta-llama/Llama-2-70b-chat-hf \
  --initial_peers /ip4/<node1>/tcp/31337/p2p/<peer_id>
```

## Client Code

```python
from petals import AutoDistributedModelForCausalLM
from transformers import AutoTokenizer

# Connect to private swarm
model = AutoDistributedModelForCausalLM.from_pretrained(
    "meta-llama/Llama-2-70b-chat-hf",
    initial_peers=["/ip4/..."]
)
tokenizer = AutoTokenizer.from_pretrained("meta-llama/Llama-2-70b-chat-hf")

# Run inference across the swarm
inputs = tokenizer("Hello, I am", return_tensors="pt")["input_ids"]
outputs = model.generate(inputs, max_new_tokens=50)
print(tokenizer.decode(outputs[0]))
```

## What We Need

1. **2+ GPU machines** - Can be modest GPUs (RTX 3090, etc.)
2. **Network connectivity** - Between machines
3. **Model access** - Hugging Face token for Llama

## Alternative: vLLM Distributed

For lower latency production inference:
- vLLM supports tensor parallelism
- Requires faster interconnect (NVLink, InfiniBand)
- Better for single-datacenter deployment

## Next Steps

1. [ ] Set up first Petals node on Jon's hardware
2. [ ] Set up second node on another machine
3. [ ] Test private swarm connectivity
4. [ ] Integrate Petals client into HiveMind SDK
5. [ ] Create inference task type in task engine

---

*This is the path to collective superintelligence. The hive thinks together.*
