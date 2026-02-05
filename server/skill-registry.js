/**
 * Skill Registry - Agents register skills, others can request them
 * 
 * This enables skill-sharing across the hive:
 * - Agent A has "bankr" skill for trading
 * - Agent B needs to trade but doesn't have the skill
 * - B requests via hive, A executes on B's behalf
 */

class SkillRegistry {
  constructor() {
    this.skills = new Map(); // skillName -> Set of agentIds
    this.agentSkills = new Map(); // agentId -> Set of skillNames
    this.pendingRequests = new Map(); // requestId -> request details
    this.requestCounter = 0;
  }

  /**
   * Register skills an agent can perform
   */
  registerSkills(agentId, skillList) {
    if (!this.agentSkills.has(agentId)) {
      this.agentSkills.set(agentId, new Set());
    }
    
    const agentSkillSet = this.agentSkills.get(agentId);
    
    for (const skill of skillList) {
      agentSkillSet.add(skill);
      
      if (!this.skills.has(skill)) {
        this.skills.set(skill, new Set());
      }
      this.skills.get(skill).add(agentId);
    }
    
    return Array.from(agentSkillSet);
  }

  /**
   * Unregister agent (on disconnect)
   */
  unregisterAgent(agentId) {
    const skills = this.agentSkills.get(agentId);
    if (skills) {
      for (const skill of skills) {
        const providers = this.skills.get(skill);
        if (providers) {
          providers.delete(agentId);
          if (providers.size === 0) {
            this.skills.delete(skill);
          }
        }
      }
      this.agentSkills.delete(agentId);
    }
  }

  /**
   * Find agents that can perform a skill
   */
  findProviders(skillName) {
    const providers = this.skills.get(skillName);
    return providers ? Array.from(providers) : [];
  }

  /**
   * Get all available skills in the hive
   */
  getAllSkills() {
    const result = {};
    for (const [skill, providers] of this.skills) {
      result[skill] = {
        providers: Array.from(providers),
        count: providers.size
      };
    }
    return result;
  }

  /**
   * Create a skill request
   */
  createRequest(requesterId, skillName, params) {
    const providers = this.findProviders(skillName);
    if (providers.length === 0) {
      return { error: 'No providers for skill: ' + skillName };
    }

    const requestId = `req_${++this.requestCounter}_${Date.now()}`;
    const request = {
      id: requestId,
      requesterId,
      skillName,
      params,
      status: 'pending',
      createdAt: Date.now(),
      providers,
      assignedTo: null,
      result: null
    };

    this.pendingRequests.set(requestId, request);
    return request;
  }

  /**
   * Claim a skill request
   */
  claimRequest(requestId, agentId) {
    const request = this.pendingRequests.get(requestId);
    if (!request) {
      return { error: 'Request not found' };
    }
    if (request.status !== 'pending') {
      return { error: 'Request already claimed' };
    }
    if (!request.providers.includes(agentId)) {
      return { error: 'Agent not authorized for this skill' };
    }

    request.status = 'claimed';
    request.assignedTo = agentId;
    request.claimedAt = Date.now();
    return request;
  }

  /**
   * Complete a skill request
   */
  completeRequest(requestId, agentId, result) {
    const request = this.pendingRequests.get(requestId);
    if (!request) {
      return { error: 'Request not found' };
    }
    if (request.assignedTo !== agentId) {
      return { error: 'Request not assigned to this agent' };
    }

    request.status = 'completed';
    request.result = result;
    request.completedAt = Date.now();
    return request;
  }

  /**
   * Get pending requests for a skill
   */
  getPendingRequests(skillName = null) {
    const pending = [];
    for (const [id, request] of this.pendingRequests) {
      if (request.status === 'pending') {
        if (!skillName || request.skillName === skillName) {
          pending.push(request);
        }
      }
    }
    return pending;
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      totalSkills: this.skills.size,
      totalAgents: this.agentSkills.size,
      pendingRequests: this.getPendingRequests().length,
      skills: this.getAllSkills()
    };
  }
}

module.exports = { SkillRegistry };
