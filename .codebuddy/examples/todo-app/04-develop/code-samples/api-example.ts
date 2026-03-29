/**
 * 待办事项应用 - API 示例代码
 * 
 * 🏗️ BMAD 阶段四：Develop - 代码实现示例
 */

import express, { Request, Response, NextFunction } from 'express';

// ============================================
// 类型定义
// ============================================

interface Task {
  id: string;
  title: string;
  completed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface CreateTaskRequest {
  title: string;
}

interface UpdateTaskRequest {
  title?: string;
  completed?: boolean;
}

interface ApiResponse<T = unknown> {
  code: number;
  message?: string;
  data?: T;
}

// ============================================
// 路由实现
// ============================================

const router = express.Router();

/**
 * GET /api/tasks
 * 获取所有任务
 */
router.get('/tasks', async (req: Request, res: Response<ApiResponse<Task[]>>) => {
  try {
    // 实际项目中从数据库获取
    const tasks = await TaskService.findAll();
    
    res.json({
      code: 200,
      data: tasks
    });
  } catch (error) {
    console.error('获取任务列表失败:', error);
    res.status(500).json({
      code: 500,
      message: '服务器错误'
    });
  }
});

/**
 * POST /api/tasks
 * 创建新任务
 */
router.post('/tasks', async (
  req: Request<unknown, unknown, CreateTaskRequest>,
  res: Response<ApiResponse<Task>>
) => {
  try {
    const { title } = req.body;
    
    // 输入验证
    if (!title || title.trim() === '') {
      return res.status(400).json({
        code: 400,
        message: '任务标题不能为空'
      });
    }
    
    if (title.length > 200) {
      return res.status(400).json({
        code: 400,
        message: '任务标题不能超过 200 字符'
      });
    }
    
    // 创建任务
    const task = await TaskService.create({
      title: title.trim()
    });
    
    res.status(201).json({
      code: 201,
      data: task
    });
  } catch (error) {
    console.error('创建任务失败:', error);
    res.status(500).json({
      code: 500,
      message: '服务器错误'
    });
  }
});

/**
 * PUT /api/tasks/:id
 * 更新任务
 */
router.put('/tasks/:id', async (
  req: Request<{ id: string }, unknown, UpdateTaskRequest>,
  res: Response<ApiResponse<Task>>
) => {
  try {
    const { id } = req.params;
    const { title, completed } = req.body;
    
    // 查找任务
    const existingTask = await TaskService.findById(id);
    if (!existingTask) {
      return res.status(404).json({
        code: 404,
        message: '任务不存在'
      });
    }
    
    // 验证标题
    if (title !== undefined) {
      if (title.trim() === '') {
        return res.status(400).json({
          code: 400,
          message: '任务标题不能为空'
        });
      }
      if (title.length > 200) {
        return res.status(400).json({
          code: 400,
          message: '任务标题不能超过 200 字符'
        });
      }
    }
    
    // 更新任务
    const task = await TaskService.update(id, {
      title: title?.trim(),
      completed
    });
    
    res.json({
      code: 200,
      data: task
    });
  } catch (error) {
    console.error('更新任务失败:', error);
    res.status(500).json({
      code: 500,
      message: '服务器错误'
    });
  }
});

/**
 * DELETE /api/tasks/:id
 * 删除任务
 */
router.delete('/tasks/:id', async (
  req: Request<{ id: string }>,
  res: Response<ApiResponse>
) => {
  try {
    const { id } = req.params;
    
    // 查找任务
    const existingTask = await TaskService.findById(id);
    if (!existingTask) {
      return res.status(404).json({
        code: 404,
        message: '任务不存在'
      });
    }
    
    // 删除任务
    await TaskService.delete(id);
    
    res.json({
      code: 200,
      message: '任务已删除'
    });
  } catch (error) {
    console.error('删除任务失败:', error);
    res.status(500).json({
      code: 500,
      message: '服务器错误'
    });
  }
});

// ============================================
// 服务层（示例）
// ============================================

/**
 * 任务服务类
 * 实际项目中会使用 Prisma 或其他 ORM
 */
class TaskService {
  /**
   * 获取所有任务
   */
  static async findAll(): Promise<Task[]> {
    // 实际实现：return prisma.task.findMany({ orderBy: { createdAt: 'desc' } });
    return [];
  }
  
  /**
   * 根据 ID 获取任务
   */
  static async findById(id: string): Promise<Task | null> {
    // 实际实现：return prisma.task.findUnique({ where: { id } });
    return null;
  }
  
  /**
   * 创建任务
   */
  static async create(data: { title: string }): Promise<Task> {
    // 实际实现：return prisma.task.create({ data: { title: data.title } });
    return {
      id: crypto.randomUUID(),
      title: data.title,
      completed: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
  
  /**
   * 更新任务
   */
  static async update(id: string, data: UpdateTaskRequest): Promise<Task> {
    // 实际实现：return prisma.task.update({ where: { id }, data });
    return {
      id,
      title: data.title || '',
      completed: data.completed || false,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
  
  /**
   * 删除任务
   */
  static async delete(id: string): Promise<void> {
    // 实际实现：await prisma.task.delete({ where: { id } });
  }
}

export default router;
